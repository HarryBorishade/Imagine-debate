export function getSocketUrl() {
  const configuredSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;

  if (typeof window === "undefined") {
    return configuredSocketUrl || "http://localhost:4000";
  }

  const { hostname, protocol } = window.location;
  const socketProtocol = protocol === "https:" ? "https:" : "http:";

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${socketProtocol}//localhost:4000`;
  }

  if (configuredSocketUrl) {
    return configuredSocketUrl;
  }

  return `${socketProtocol}//${hostname}:4000`;
}
