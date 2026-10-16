export function createProjectIdentity() {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const offset = -now.getTimezoneOffset();
    const zone = `${offset >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')}:${String(Math.abs(offset) % 60).padStart(2, '0')}`;
    const createdAt = new Date(now.getTime() + offset * 60000).toISOString().slice(0, -1) + zone;
    return {id: `${date}-${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`,
        created_at: createdAt, created_at_source: 'new_project'};
}

export function projectIdentity(project) {
    return Object.fromEntries(['id', 'created_at', 'created_at_source'].filter(key => project[key] != null).map(key => [key, project[key]]));
}
