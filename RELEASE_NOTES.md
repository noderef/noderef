This patch fixes the Windows per user install, blocks cross origin calls to the local backend, and shows the NodeRef icon in the Windows app. 🔧

**Install just for you** now finishes without an administrator prompt. In 0.13.0 that choice still asked for admin rights, so a locked down PC could not complete the install. The installer defaults to your user profile. To install for all users, start the installer with **Run as administrator** and pick that option. If you already installed NodeRef for all users, keep that option when upgrading.

A website could previously call the local NodeRef backend from another origin. CORS only hid the response in the browser, so the backend still ran the request. Those **cross-origin** calls are now refused before anything runs. The desktop app only accepts requests from this NodeRef session. Docker still opens in the browser on the same address, and **WEB_PASSWORD** still protects it when you set one.
