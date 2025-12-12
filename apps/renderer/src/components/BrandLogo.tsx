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

interface BrandLogoProps {
  size?: number;
  color?: string;
}

export function BrandLogo({ size = 20, color = 'currentColor' }: BrandLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      viewBox="1896 1898.19 1540 1536.96"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', color }}
      aria-label="NodeRef logo"
    >
      <path
        fill="currentColor"
        fillRule="nonzero"
        d="m1895.99989,1900.64037l0,1534.50658l387.99998,-291.65332l0,-520.34664l382.82664,-248.55999l381.17331,245.25332l0,526.95997l387.99998,-283.35998l0,-521.99997l-768.78662,-443.25331l-387.67998,219.54665l-383.53331,-217.09332"
      />
    </svg>
  );
}
