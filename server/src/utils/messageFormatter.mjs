# Message formatter
export function format_alert(payload = {}) {
  const lines = [];
  if (payload.simulated) lines.push('[SIMULATED DATA]');
  lines.push(WiFi SSID: );
  lines.push(BSSID / MAC: );
  lines.push(Local IP: );
  lines.push(Public IP: );
  lines.push(Approx. geolocation: );
  if (payload.city) lines.push(Approx. IP city: Approximate: );
  else lines.push('Approx. IP city: Unavailable');
  lines.push(Transformer: );
  lines.push(Timestamp: );
  lines.push(Reject reason: );
  return lines.join('\n');
}
