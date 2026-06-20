export async function readJsonRecord(response: Response): Promise<Record<string, any>> {
  const payload = await response.json().catch(() => ({}))
  return payload && typeof payload === "object" ? payload as Record<string, any> : {}
}

export async function readRequestJsonRecord(request: Request): Promise<Record<string, any>> {
  const payload = await request.json().catch(() => ({}))
  return payload && typeof payload === "object" ? payload as Record<string, any> : {}
}
