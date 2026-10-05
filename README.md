# SharedBoard

A lightweight desktop application prototype designed to behave like a shared sticky note / mini piece of stationery paper for two or more participants with real-time synchronization.

## Current Status

- [x] Initial project structure created
- [x] Physical stationery paper styling with subtle grain, natural edges, and stationery controls
- [x] Room Creation with clean 6-character code (e.g. `A7K3P9`)
- [x] Room Joining with validation and `"Room not found"` error feedback
- [x] Connection status indicator:
  - 🟢 Online (`Room: A7K3P9` / `Online`)
  - 🟡 Connecting / Reconnecting
  - 🔴 Offline
- [x] Real-time drawing synchronization:
  - Lightweight stroke segment streaming
  - Pen colors (5 swatches: Black, Red, Blue, Green, Purple)
  - Pen sizes (Small 2px, Medium 4px, Large 7px)
  - Eraser with sizes (Small 8px, Medium 15px, Large 25px)
  - Duplicate stroke prevention (sender draws locally; only peers receive events)
- [x] Real-time shared text synchronization
- [x] Real-time canvas clear synchronization
- [x] Room isolation (events never leak to other rooms)
- [x] Board state catch-up for new/rejoining users (text and full stroke history replay)
- [x] Full Electron desktop application integration:
  - Automatically boots the local Node.js / Socket.IO server if not already running
  - Automatically attaches if port 3000 is already running (no duplicate servers/crashes)
  - Clean shutdown of internal server when the desktop window is closed
  - Launches with `npm start` or `npm run electron`
  - Browser testing still available via `npm run server` or side-by-side with desktop app
- [ ] Permanent disk persistence across server restarts (Planned)

## Setup & Running

### Launch Desktop App (Recommended)

Run:

```bash
npm start
```
*(or `npm run electron`)*

This single command automatically:
1. Starts the internal Node.js / Socket.IO server on port 3000 (if not already running).
2. Opens the SharedBoard desktop widget window.
3. Automatically shuts down the internal server when you quit the application.

---

### Collaborative Testing (Desktop App + Browser)

1. Launch the desktop app:
   ```bash
   npm start
   ```
2. In the desktop app, click **🔗 Share** to create a room (e.g. `A7K3P9`).
3. Open any web browser to `http://localhost:3000`.
4. In the browser, type the code `A7K3P9` and click **↪ Join**.
5. Draw, erase, or type in either window — see instant real-time synchronization between the desktop app and the browser!

---

### Run in Browser Only (Without Electron)

```bash
npm run server
```

Then visit `http://localhost:3000`.
