# Gemini Vault AI

Create a complete, fully functional, cross-device AI Assistant and Cloud Vault mobile application named "Gemini Vault AI" using React Native/Tailwind. Integrate Gemini 1.5 API key securely via hidden environment variables.

KEY FEATURES & STRUCTURE:

1. GEMINI-STYLE MAIN INTERFACE:

   - Full Google Gemini app UI clone: Dark theme layout, top model dropdown (Gemini 1.5 Flash / Gemini 1.5 Pro), chat window, microphone button for Voice Input, and Live Video Mode toggle (camera integration).

   - In-chat AI Image & Video Generation integration using API placeholders.

   - UI Footer/Header Credit: Display subtle text "Developed by Shubhankar" in the interface.

2. ANONYMOUS RECOVERY KEY SYSTEM (NO EMAIL/PHONE NEEDED):

   - First-Time Setup: Generates a unique 12-character Secret Recovery Key (e.g., A8F9-4K2P-90X1) for the user to save.

   - Multi-Device & 10-Year Cloud Restore: On any new phone/device, an initial login screen allows entering this Secret Recovery Key to instantly restore all previous Chat History, AI Data, and Cloud Vault Files from Supabase Backend.

3. CLOUD VAULT SYSTEM & STRICT PIN LOGIC:

   - Secure Cloud Storage: All hidden files (Photos, Videos, Audio, Documents) are encrypted and stored in Supabase Cloud linked to the user's Secret Recovery Key.

   - Auto-Delete from Local Gallery: When a file is moved to the Vault, it transfers to cloud vault and removes local device visibility.

   - Voice/Text Command Entry: Access to the Vault is triggered ONLY by typing or saying "আমার পার্সোনাল ভল্ট খোলো" (or "Open my personal vault").

   - PIN Logic: First time requires setting a 4-digit master PIN. Subsequent entries require this PIN. Inside the Vault, top-right Settings allows changing the PIN only after validating the old PIN.

4. SYSTEM INSTRUCTIONS & DEVELOPER PRIVACY LOGIC:

   - Creator Identity: If asked "who created you?", AI responds: "এই অ্যাপটি শুভঙ্কর বানিয়েছেন।"

   - Developer Privacy Guard: If asked for personal details, phone number, address, or secrets of Shubhankar, AI must respond: "নিরাপত্তা সংক্রান্ত সীমাবদ্ধতার কারণে আমার ডেভেলপারের ব্যক্তিগত তথ্য প্রকাশ করা সম্ভব নয়। তবে উনি ক্লাস ১০-এর একজন উদীয়মান ডেভেলপার।"

5. MULTILINGUAL & KEYBOARD SUPPORT:

   - Dynamic language toggling (Auto-Detect, Bengali Mode, English Mode) via a Globe (🌐) icon on the input bar.

   - Optional on-screen Bengali virtual keyboard layout bar above the main chat input field.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a9b4d8b9-7668-4f03-a898-956a01a9557e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
