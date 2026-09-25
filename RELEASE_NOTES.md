This release brings local AI models and an easier Windows install. 🚀

You can now connect the agent to **your own AI server** with the new **Custom** provider in the AI settings. Any server that speaks the Anthropic Messages API works, such as Ollama or LiteLLM. Enter the base URL, add a token only if your server needs one, and use **Test connection** to check it and load the available models.

The **Windows installer** can now **install for the current user only**, without admin rights. Click **Advanced** in the installer and pick "Install just for you". NodeRef then installs into your user profile. If you already installed NodeRef for all users, keep that option when upgrading. Switching to a per user install creates a second, separate installation.

On some Windows machines the app got stuck with **"Backend did not become healthy in time."** This happened when Docker Desktop or WSL had reserved the port the backend tries first. The backend now skips reserved ports and moves on to the next free one.
