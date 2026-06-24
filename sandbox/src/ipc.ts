// Sandbox IPC utilities

/**
 * Performs the client side of the UDS auth handshake protocol.
 *
 * Sends `{ type: "auth", token }` over an already-connected socket and waits
 * up to `timeoutMs` for a response from the server (which proves
 * authentication succeeded). On timeout, the socket is destroyed and the
 * promise resolves `false`.
 *
 * The auth token is read from `socket.authToken` when present, falling back
 * to the `CMD_AUTH_TOKEN` environment variable.
 *
 * @returns `true` if the server accepted the token, `false` on timeout or
 *          socket closure.
 */
export function handleSocketHandshake(
  socket: any,
  timeoutMs: number,
): Promise<boolean> {
  const token: string =
    socket.authToken ?? process.env.CMD_AUTH_TOKEN ?? "";

  return new Promise<boolean>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        socket.destroy();
        resolve(false);
      }
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("close", onClose);
      socket.removeListener("error", onClose);
    }

    function onData() {
      if (!settled) {
        settled = true;
        cleanup();
        resolve(true);
      }
    }

    function onClose() {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    }

    socket.on("data", onData);
    socket.on("close", onClose);
    socket.on("error", onClose);

    socket.write(JSON.stringify({ type: "auth", token }) + "\n");
  });
}

