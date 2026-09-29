export async function readDatasetResponse(response, path, messages) {
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch {
        const reason = [404,405].includes(response.status) ? messages.restart : messages.invalid;
        throw new Error(`${reason}\n${path} · HTTP ${response.status}\n${text.slice(0,300)}`);
    }
    if (!response.ok) {
        const reason = [404,405].includes(response.status) ? messages.restart : data?.error || response.statusText;
        throw new Error(`${reason}\n${path} · HTTP ${response.status}`);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${messages.invalid}\n${path} · HTTP ${response.status}`);
    return data;
}
