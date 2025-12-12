/**
 * Copyright 2025 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const installersDir = path.join(distDir, 'installers');

// Ensure installers directory exists
if (!fs.existsSync(installersDir)) {
  fs.mkdirSync(installersDir, { recursive: true });
}

function run(command, options = {}) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit', cwd: projectRoot, ...options });
}

function runHdiutilCreate(command, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      run(command);
      return;
    } catch (error) {
      const errorMessage = String(error?.message || '');
      if (errorMessage.includes('Resource busy') && attempt < retries) {
        console.warn(`hdiutil Resource busy, retrying (${attempt}/${retries - 1})...`);
        // Small delay before retry
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        continue;
      }
      throw error;
    }
  }
}

function zipDir(srcDir, destZip) {
  const parent = path.dirname(srcDir);
  const base = path.basename(srcDir);

  if (process.platform === 'win32') {
    // Use PowerShell on Windows
    const srcEsc = srcDir.replace(/'/g, "''");
    const dstEsc = destZip.replace(/'/g, "''");
    run(
      `powershell -NoProfile -Command "Compress-Archive -Path '${srcEsc}\\*' -DestinationPath '${dstEsc}' -Force"`
    );
  } else {
    // Use zip on macOS/Linux
    run(`zip -r "${destZip}" "${base}"`, { cwd: parent });
  }
}

function tarDir(srcDir, destTarGz) {
  const parent = path.dirname(srcDir);
  const base = path.basename(srcDir);
  run(`tar -czf "${destTarGz}" -C "${parent}" "${base}"`);
}

async function packageMac() {
  console.log('Packaging for macOS...');

  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  const macBuilds = entries.filter(
    entry =>
      entry.isDirectory() &&
      entry.name.startsWith('mac_') &&
      fs.existsSync(path.join(distDir, entry.name, 'NodeRef.app'))
  );

  if (macBuilds.length === 0) {
    console.log('No macOS builds found in dist/. Skipping macOS packaging.');
    return;
  }

  for (const build of macBuilds) {
    const buildPath = path.join(distDir, build.name);
    const appPath = path.join(buildPath, 'NodeRef.app');
    const arch = build.name.replace('mac_', ''); // arm64, x64, etc.
    const dmgName = `NodeRef-mac-${arch}.dmg`;
    const dmgPath = path.join(installersDir, dmgName);

    console.log(`Creating DMG for ${build.name}...`);

    if (fs.existsSync(dmgPath)) {
      fs.unlinkSync(dmgPath);
    }

    const tempDmgDir = path.join(distDir, `temp_dmg_${arch}`);
    if (fs.existsSync(tempDmgDir)) {
      fs.rmSync(tempDmgDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDmgDir);

    // Overwrite app icon for the .app itself
    const appIconDest = path.join(appPath, 'Contents', 'Resources', 'icon.icns');
    const appIconSource = path.join(projectRoot, 'resources', 'icons', 'appIcon.icns');
    if (fs.existsSync(appIconSource)) {
      console.log('Overwriting app icon in .app bundle...');
      fs.copyFileSync(appIconSource, appIconDest);
      run(`touch "${appPath}"`);
    } else {
      console.warn('Warning: appIcon.icns not found, skipping app icon overwrite.');
    }

    // Fix permissions for executables
    console.log('Fixing permissions for executables...');
    const macOsDir = path.join(appPath, 'Contents', 'MacOS');
    const binaries = ['bootstrap', 'main'];

    binaries.forEach(binary => {
      const binaryPath = path.join(macOsDir, binary);
      if (fs.existsSync(binaryPath)) {
        run(`chmod +x "${binaryPath}"`);
        console.log(`Fixed permissions for ${binary}`);
      } else {
        console.warn(`Warning: Binary ${binary} not found in ${macOsDir}`);
      }
    });

    // Fix permissions for backend node binary and server.js
    const resourcesDir = path.join(appPath, 'Contents', 'Resources');
    const nodeBinary = path.join(resourcesDir, 'node');
    const serverJs = path.join(resourcesDir, 'node-src', 'dist', 'server.js');

    if (fs.existsSync(nodeBinary)) {
      run(`chmod +x "${nodeBinary}"`);
      console.log('Fixed permissions for node binary');
    } else {
      console.warn(`Warning: Node binary not found at ${nodeBinary}`);
    }

    if (fs.existsSync(serverJs)) {
      run(`chmod +x "${serverJs}"`);
      console.log('Fixed permissions for server.js');
    } else {
      console.warn(`Warning: server.js not found at ${serverJs}`);
    }

    console.log('Copying .app to temporary staging area...');
    run(`cp -R "${appPath}" "${tempDmgDir}/"`);

    console.log('Creating /Applications link...');
    run(`ln -s /Applications "${tempDmgDir}/Applications"`);

    // Optional DMG volume icon
    const iconPath = path.join(projectRoot, 'resources', 'icons', 'appIcon.icns');
    if (fs.existsSync(iconPath)) {
      console.log('Setting DMG volume icon...');
      run(`cp "${iconPath}" "${tempDmgDir}/.VolumeIcon.icns"`);
      try {
        run(`SetFile -c icnC "${tempDmgDir}/.VolumeIcon.icns"`);
        run(`SetFile -a C "${tempDmgDir}"`);
        run(`SetFile -a V "${tempDmgDir}/.VolumeIcon.icns"`);
      } catch (err) {
        console.warn('SetFile not available; skipping DMG icon attributes.');
      }
    } else {
      console.warn('Warning: appIcon.icns not found, skipping DMG icon setting.');
    }

    console.log(`Generating ${dmgName}...`);
    try {
      const volName = `NodeRef-${arch}`;
      runHdiutilCreate(
        `hdiutil create -volname "${volName}" -srcfolder "${tempDmgDir}" -ov -format UDZO "${dmgPath}"`
      );
      console.log(`Successfully created ${dmgPath}`);
    } catch (error) {
      console.error(`Failed to create DMG for ${build.name}:`, error);
      process.exitCode = 1;
      throw error;
    } finally {
      console.log('Cleaning up temporary files...');
      fs.rmSync(tempDmgDir, { recursive: true, force: true });
    }
  }
}

function findWixToolset() {
  // Check common WiX installation paths
  const possiblePaths = [
    'C:\\Program Files (x86)\\WiX Toolset v3.11\\bin',
    'C:\\Program Files\\WiX Toolset v3.11\\bin',
    'C:\\Program Files (x86)\\WiX Toolset v4.0\\bin',
    'C:\\Program Files\\WiX Toolset v4.0\\bin',
    process.env.WIX || '',
  ].filter(Boolean);

  for (const wixPath of possiblePaths) {
    const candlePath = path.join(wixPath, 'candle.exe');
    const lightPath = path.join(wixPath, 'light.exe');
    const heatPath = path.join(wixPath, 'heat.exe');
    if (fs.existsSync(candlePath) && fs.existsSync(lightPath)) {
      return {
        candle: candlePath,
        light: lightPath,
        heat: fs.existsSync(heatPath) ? heatPath : null,
        path: wixPath,
      };
    }
  }

  // Check if WiX is in PATH
  try {
    execSync('candle.exe -?', { stdio: 'ignore' });
    execSync('light.exe -?', { stdio: 'ignore' });
    let heat = null;
    try {
      execSync('heat.exe -?', { stdio: 'ignore' });
      heat = 'heat.exe';
    } catch {
      // heat not in PATH
    }
    return { candle: 'candle.exe', light: 'light.exe', heat, path: null };
  } catch {
    return null;
  }
}

function generateWixXml(buildPath, arch, version, iconPath, licensePath, useHeat = false) {
  // Convert version to MSI format (e.g., "0.1.49" -> "0.1.49.0")
  const msiVersion = version.split('.').concat(['0']).slice(0, 4).join('.');
  const productId = `{${crypto.randomUUID().toUpperCase()}}`;
  const upgradeCode = '{A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D}'; // Fixed upgrade code for version upgrades
  const shortcutGuid = `{${crypto.randomUUID().toUpperCase()}}`;

  // Normalize paths for WiX (use forward slashes)
  const normalizedBuildPath = buildPath.replace(/\\/g, '/');
  const normalizedIconPath =
    iconPath && fs.existsSync(iconPath) ? iconPath.replace(/\\/g, '/') : '';
  const normalizedLicensePath =
    licensePath && fs.existsSync(licensePath) ? licensePath.replace(/\\/g, '/') : '';

  // Cache directory structure generation so we do not create mismatched GUIDs
  const dirStructure = useHeat ? null : generateDirectoryStructure(normalizedBuildPath);

  // If using heat.exe, reference the ComponentGroup it creates
  // heat.exe creates a Fragment with ComponentGroup, so we just reference it
  const componentRefs = useHeat
    ? '      <ComponentGroupRef Id="ApplicationFiles" />'
    : dirStructure.componentRefs;

  // When using heat.exe, the directory structure is defined in the harvested fragment
  // We still need to define INSTALLFOLDER in the main Product
  const directoryStructure = useHeat
    ? '          <!-- Files harvested by heat.exe will be installed to INSTALLFOLDER -->'
    : dirStructure.directoryStructure;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product Id="${productId}"
           Name="NodeRef"
           Language="1033"
           Version="${msiVersion}"
           Manufacturer="NodeRef"
           UpgradeCode="${upgradeCode}">
    <Package InstallerVersion="200" Compressed="yes" InstallScope="perMachine" />
    
    <MajorUpgrade DowngradeErrorMessage="A newer version of [ProductName] is already installed." />
    
    <!-- Embed cabinets so the MSI is self contained (no external .cab alongside the .msi) -->
    <MediaTemplate EmbedCab="yes" CompressionLevel="high" />
    
    <Feature Id="ProductFeature" Title="NodeRef" Level="1">
${componentRefs}
      <ComponentRef Id="ApplicationShortcut" />
    </Feature>
    
    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="ProgramFilesFolder">
        <Directory Id="INSTALLFOLDER" Name="NodeRef">
${directoryStructure}
        </Directory>
      </Directory>
      <Directory Id="ProgramMenuFolder">
        <Directory Id="ApplicationProgramsFolder" Name="NodeRef">
          <Component Id="ApplicationShortcut" Guid="${shortcutGuid}">
            <Shortcut Id="ApplicationStartMenuShortcut"
                      Name="NodeRef"
                      Description="NodeRef - The desktop app every Alfresco admin deserves"
                      Target="[INSTALLFOLDER]NodeRef.exe"
                      WorkingDirectory="INSTALLFOLDER"${normalizedIconPath ? '\n                      Icon="AppIcon"' : ''} />
            <RemoveFolder Id="ApplicationProgramsFolder" On="uninstall" />
            <RegistryValue Root="HKCU" Key="Software\\NodeRef" Name="installed" Type="integer" Value="1" KeyPath="yes" />
          </Component>
        </Directory>
      </Directory>
    </Directory>
    ${normalizedIconPath ? `<Icon Id="AppIcon" SourceFile="${normalizedIconPath}" />` : ''}
    ${normalizedIconPath ? '<Property Id="ARPPRODUCTICON" Value="AppIcon" />' : ''}
    ${normalizedLicensePath ? `<WixVariable Id="WixUILicenseRtf" Value="${normalizedLicensePath}" />` : ''}
    
    <UIRef Id="WixUI_Minimal" />
  </Product>
</Wix>`;
}

function generateDirectoryStructure(buildPath) {
  const directories = new Map(); // path -> { id, guid, components }
  const componentRefs = [];
  let componentIndex = 0;

  // Add root component for NodeRef.exe
  const rootGuid = `{${crypto.randomUUID().toUpperCase()}}`;
  const rootComponentId = 'Component_Root';
  directories.set('', {
    id: 'INSTALLFOLDER',
    guid: rootGuid,
    components: [
      `          <Component Id="${rootComponentId}" Guid="${rootGuid}">
            <File Id="NodeRefExe" Source="${buildPath}/NodeRef.exe" KeyPath="yes" />
          </Component>`,
    ],
  });
  componentRefs.push(`      <ComponentRef Id="${rootComponentId}" />`);

  function walkDir(dir, baseDir = dir, relativeDir = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

        if (entry.isDirectory()) {
          walkDir(fullPath, baseDir, relativePath);
        } else if (entry.isFile() && entry.name !== 'NodeRef.exe') {
          // Get or create directory entry
          const dirKey = relativeDir || '';
          if (!directories.has(dirKey)) {
            const dirId = dirKey
              ? `Dir_${dirKey.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}`
              : 'INSTALLFOLDER';
            const dirGuid = `{${crypto.randomUUID().toUpperCase()}}`;
            directories.set(dirKey, { id: dirId, guid: dirGuid, components: [] });
          }

          // Add file component
          const componentId = `Component_${componentIndex++}`;
          const componentGuid = `{${crypto.randomUUID().toUpperCase()}}`;
          const safeFileName = entry.name.replace(/[^a-zA-Z0-9]/g, '_');
          const fileId = `File_${componentIndex}_${safeFileName.substring(0, 40)}`;
          const normalizedPath = fullPath.replace(/\\/g, '/');

          directories.get(dirKey).components
            .push(`          <Component Id="${componentId}" Guid="${componentGuid}">
            <File Id="${fileId}" Source="${normalizedPath}" KeyPath="yes" />
          </Component>`);
          componentRefs.push(`      <ComponentRef Id="${componentId}" />`);
        }
      }
    } catch (err) {
      // Ignore errors reading directories
    }
  }

  walkDir(buildPath);

  // Build directory structure XML
  const dirStructure = [];
  for (const [dirPath, dirInfo] of directories.entries()) {
    if (dirPath === '') {
      // Root directory - just add components
      dirStructure.push(...dirInfo.components);
    } else {
      // Subdirectory
      const dirParts = dirPath.split('/').filter(Boolean);
      const dirName = dirParts[dirParts.length - 1];
      dirStructure.push(`          <Directory Id="${dirInfo.id}" Name="${dirName}">`);
      dirStructure.push(...dirInfo.components);
      dirStructure.push(`          </Directory>`);
    }
  }

  return {
    directoryStructure:
      dirStructure.length > 0
        ? dirStructure.join('\n')
        : '            <!-- No additional files -->',
    componentRefs: componentRefs.join('\n'),
  };
}

async function createMsiInstaller(buildPath, arch, version, iconPath, wixTools) {
  const msiName = `NodeRef-win-${arch}.msi`;
  const msiPath = path.join(installersDir, msiName);
  const tempDir = path.join(distDir, `temp_wix_${arch}`);

  try {
    // Create temp directory for WiX files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });

    const wxsPath = path.join(tempDir, 'installer.wxs');
    const harvestedWxsPath = path.join(tempDir, 'harvested.wxs');
    const wixObjPath = path.join(tempDir, 'installer.wixobj');
    const harvestedWixObjPath = path.join(tempDir, 'harvested.wixobj');
    const licenseRtfPath = path.join(tempDir, 'license.rtf');

    // Generate RTF license from project LICENSE
    const licensePath = path.join(projectRoot, 'LICENSE');
    if (fs.existsSync(licensePath)) {
      console.log('Generating license.rtf from LICENSE...');
      const licenseText = fs.readFileSync(licensePath, 'utf8');

      // Basic Text to RTF conversion
      const rtfHeader =
        '{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033{\\fonttbl{\\f0\\fnil\\fcharset0 Calibri;}}\\viewkind4\\uc1\\pard\\sa200\\sl276\\slmult1\\f0\\fs22\\lang9 ';
      const rtfFooter = '\\par }';

      // Escape special characters and convert newlines
      const rtfContent = licenseText
        .replace(/\\/g, '\\\\')
        .replace(/\{/g, '\\{')
        .replace(/\}/g, '\\}')
        .replace(/\n/g, '\\par\n');

      fs.writeFileSync(licenseRtfPath, rtfHeader + rtfContent + rtfFooter, 'utf8');
    } else {
      console.warn('Warning: LICENSE file not found at root, skipping RTF generation.');
    }

    // Use heat.exe to harvest files if available, otherwise generate manually
    let useHeat = false;
    if (wixTools.heat) {
      try {
        console.log(`Harvesting files with heat.exe...`);
        // -gg: generate guids, -g1: generate guids once per component
        // -scom: suppress COM elements, -srd: suppress root dir, -sreg: suppress registry
        // -ke: keep empty directories, -cg: component group name, -dr: directory reference
        // -var: use variable for source directory (allows -b flag in light.exe)
        // Note: We don't use -sfrag because we need the Fragment wrapper for ComponentGroup
        run(
          `"${wixTools.heat}" dir "${buildPath}" -nologo -gg -g1 -srd -sreg -scom -ke -out "${harvestedWxsPath}" -cg ApplicationFiles -dr INSTALLFOLDER -var var.SourceDir`
        );
        useHeat = true;
      } catch (err) {
        console.warn(`Warning: heat.exe failed, using manual file generation: ${err.message}`);
        useHeat = false;
      }
    }

    // Generate main WiX XML
    console.log(`Generating WiX XML for ${arch}...`);
    const wixXml = generateWixXml(
      buildPath,
      arch,
      version,
      iconPath,
      fs.existsSync(licenseRtfPath) ? licenseRtfPath : null,
      useHeat
    );
    fs.writeFileSync(wxsPath, wixXml, 'utf8');

    // Compile WiX XML to .wixobj
    console.log(`Compiling WiX XML (candle)...`);
    // Compile main installer.wxs
    run(`"${wixTools.candle}" -nologo -out "${wixObjPath}" "${wxsPath}"`);

    // Compile harvested files if using heat.exe
    if (useHeat) {
      run(
        `"${wixTools.candle}" -nologo -out "${harvestedWixObjPath}" -dSourceDir="${buildPath}" "${harvestedWxsPath}"`
      );
    }

    // Link .wixobj to .msi
    console.log(`Linking MSI (light)...`);
    const lightArgs = [`"${wixTools.light}"`, '-nologo', '-out', `"${msiPath}"`, `"${wixObjPath}"`];
    if (useHeat) {
      lightArgs.push(`"${harvestedWixObjPath}"`);
      // Add base path so light.exe can find the source files
      lightArgs.push(`-b`, `"${buildPath}"`);
    }
    lightArgs.push('-ext', 'WixUIExtension', '-cultures:en-US');
    run(lightArgs.join(' '));

    console.log(`Successfully created ${msiPath}`);
    return msiPath;
  } catch (err) {
    console.error(`Failed to create MSI installer: ${err.message}`);
    throw err;
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

async function packageWin() {
  console.log('Packaging for Windows...');

  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  const winBuilds = entries.filter(entry => {
    if (!entry.isDirectory() || !entry.name.startsWith('win_')) return false;
    const buildPath = path.join(distDir, entry.name);
    return fs.existsSync(path.join(buildPath, 'NodeRef.exe'));
  });

  if (winBuilds.length === 0) {
    console.log('No Windows builds found in dist/. Skipping Windows packaging.');
    return;
  }

  const iconPath = path.join(projectRoot, 'resources', 'icons', 'appIcon.ico');

  // Read version from package.json
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const version = packageJson.version || '0.0.0';

  // Import rcedit programmatically
  let rcedit;
  try {
    rcedit = (await import('rcedit')).default;
  } catch (err) {
    console.warn('Warning: rcedit not available, skipping icon embedding:', err.message);
    rcedit = null;
  }

  // Check for WiX Toolset
  const wixTools = findWixToolset();
  if (!wixTools) {
    console.warn('Warning: WiX Toolset not found. MSI installer will not be created.');
    console.warn('  Install WiX Toolset from: https://wixtoolset.org/releases/');
    console.warn('  Or set WIX environment variable to WiX bin directory.');
  }

  for (const build of winBuilds) {
    const buildPath = path.join(distDir, build.name);
    const exePath = path.join(buildPath, 'NodeRef.exe');
    const arch = build.name.replace('win_', ''); // x64, arm64, etc.
    const zipName = `NodeRef-win-${arch}.zip`;
    const zipPath = path.join(installersDir, zipName);

    // Embed icon into the .exe file using rcedit
    if (rcedit && fs.existsSync(iconPath) && fs.existsSync(exePath)) {
      try {
        console.log(`Embedding icon into ${exePath}...`);
        await rcedit(exePath, {
          icon: iconPath,
        });
        console.log('Icon embedded successfully');
      } catch (err) {
        console.warn(`Warning: Failed to embed icon into ${exePath}:`, err.message);
        // Continue even if icon embedding fails
      }
    } else {
      if (!rcedit) {
        console.warn('Warning: rcedit not available, skipping icon embedding');
      } else if (!fs.existsSync(iconPath)) {
        console.warn(`Warning: Icon not found at ${iconPath}, skipping icon embedding`);
      }
    }

    console.log(`Creating ZIP for ${build.name}...`);

    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    zipDir(buildPath, zipPath);
    console.log(`Successfully created ${zipPath}`);

    // Create MSI installer if WiX Toolset is available
    if (wixTools) {
      try {
        await createMsiInstaller(buildPath, arch, version, iconPath, wixTools);
      } catch (err) {
        console.warn(`Warning: Failed to create MSI installer for ${build.name}:`, err.message);
        // Continue even if MSI creation fails
      }
    }
  }
}

async function packageLinux() {
  console.log('Packaging for Linux...');

  const entries = fs.readdirSync(distDir, { withFileTypes: true });
  const linuxBuilds = entries.filter(entry => {
    if (!entry.isDirectory() || !entry.name.startsWith('linux_')) return false;
    const buildPath = path.join(distDir, entry.name);
    try {
      const files = fs.readdirSync(buildPath);
      return files.some(f => f === 'NodeRef' || f === 'NodeRef.AppImage');
    } catch {
      return false;
    }
  });

  if (linuxBuilds.length === 0) {
    console.log('No Linux builds found in dist/. Skipping Linux packaging.');
    return;
  }

  for (const build of linuxBuilds) {
    const buildPath = path.join(distDir, build.name);
    const appDir = path.join(buildPath, 'NodeRef');
    const arch = build.name.replace('linux_', ''); // x64, arm64, etc.

    // Fix permissions for executables
    if (fs.existsSync(appDir)) {
      // Fix permission for main Neutralino executable
      const mainExecutable = path.join(appDir, `noderef-linux_${arch}`);
      if (fs.existsSync(mainExecutable)) {
        run(`chmod +x "${mainExecutable}"`);
        console.log(`Fixed permissions for main executable: noderef-linux_${arch}`);
      }

      const nodeBinary = path.join(appDir, 'node');
      const serverJs = path.join(appDir, 'node-src', 'dist', 'server.js');

      if (fs.existsSync(nodeBinary)) {
        run(`chmod +x "${nodeBinary}"`);
        console.log('Fixed permissions for Linux node binary');
      }

      if (fs.existsSync(serverJs)) {
        run(`chmod +x "${serverJs}"`);
        console.log('Fixed permissions for Linux server.js');
      }
    }

    const tarName = `NodeRef-linux-${arch}.tar.gz`;
    const tarPath = path.join(installersDir, tarName);

    console.log(`Creating tar.gz for ${build.name}...`);

    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }

    tarDir(buildPath, tarPath);
    console.log(`Successfully created ${tarPath}`);

    // If there's an AppImage, copy and rename it nicely too
    const appImageSrc = path.join(buildPath, 'NodeRef.AppImage');
    if (fs.existsSync(appImageSrc)) {
      const appImageDest = path.join(installersDir, `NodeRef-linux-${arch}.AppImage`);
      fs.copyFileSync(appImageSrc, appImageDest);
      console.log(`Copied AppImage to ${appImageDest}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find(arg => arg.startsWith('--target='))?.split('=')[1];

  if (!target || target === 'mac') {
    await packageMac();
  }
  if (!target || target === 'win') {
    await packageWin();
  }
  if (!target || target === 'linux') {
    await packageLinux();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
