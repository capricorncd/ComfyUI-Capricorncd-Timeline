import { makeT } from '../cap_i18n.js';
import '../components/Button.js';
import '../components/Dialog.js';
import '../components/FormControls.js';

const versionT = makeT({
    zh: {title: '选择工程版本', load: '加载所选版本', cancel: '取消', updated: '目录中的工程文件已更新，是否加载最新版？当前编辑内容会先另存为带时间戳的工程版本及对应分镜文件。'},
    en: {title: 'Choose project version', load: 'Load selected version', cancel: 'Cancel', updated: 'The project files have changed. Load the latest version? Current edits will first be saved as a separate timestamped project and matching storyboard.'},
    ja: {title: 'プロジェクトのバージョンを選択', load: '選択したバージョンを読み込む', cancel: 'キャンセル', updated: 'プロジェクトが更新されました。最新版を読み込みますか？現在の編集内容と絵コンテは先に日時付きの別ファイルに保存します。'},
});

function projectDialog(content, heading, confirmLabel, host) {
    return new Promise(resolve => {
        const dialog = document.createElement('cap-dialog');
        dialog.minWidth = 360;
        dialog.minHeight = 220;
        dialog.height = 240;
        const title = document.createElement('span');
        title.slot = 'title'; title.textContent = heading;
        const body = document.createElement('div');
        body.style.cssText = 'padding:20px 28px;display:grid;gap:12px';
        const footer = document.createElement('div');
        footer.slot = 'footer'; footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
        let confirmed = false;
        const cancel = document.createElement('cap-button');
        cancel.textContent = versionT('cancel'); cancel.onclick = () => dialog.close();
        const load = document.createElement('cap-button');
        load.textContent = confirmLabel; load.setAttribute('variant', 'primary');
        load.onclick = () => { confirmed = true; dialog.close(); };
        footer.append(cancel, load); body.append(content); dialog.append(title, body, footer);
        dialog.addEventListener('close', () => { dialog.remove(); resolve(confirmed); }, {once: true});
        host.append(dialog); dialog.showModal();
    });
}

export function confirmProjectUpdate(host) {
    const message = document.createElement('p');
    message.textContent = versionT('updated');
    return projectDialog(message, launcherT('reload'), launcherT('reload'), host);
}

export async function chooseProjectVersion(versions, host = document.body) {
    if (versions.length < 2) return versions[0]?.filename || 'project.json';
    const select = document.createElement('cap-select');
    select.setOptions(versions.map(row => ({
        value: row.filename,
        label: `${row.filename} · ${new Date(row.modified).toLocaleString()}`,
    })), versionT('title'));
    return await projectDialog(select, versionT('title'), versionT('load'), host) ? select.value : null;
}

export const launcherT = makeT({
    zh: { reload: '加载最新版', reloadFailed: '加载工程更新失败', directory: '项目所在目录', associateConfirm: '此目录已有 project.json。关联后，保存将覆盖该文件，自动备份将更新 project.json.bak。是否关联当前工程？', save: '保存项目', folder: '打开项目目录', saved: '项目已保存', failed: '项目保存失败', backupFailed: '自动备份失败', missing: '部分素材缺失', openFailed: '无法打开项目目录' },
    en: { reload: 'Load latest', reloadFailed: 'Could not load project update', directory: 'Project directory', associateConfirm: 'This folder already contains project.json. Saving will overwrite it, and autosave will update project.json.bak. Associate the current project?', save: 'Save project', folder: 'Open project folder', saved: 'Project saved', failed: 'Project save failed', backupFailed: 'Automatic backup failed', missing: 'Some media files are missing', openFailed: 'Cannot open project folder' },
    ja: { reload: '最新版を読み込む', reloadFailed: '更新の読み込みに失敗しました', directory: 'プロジェクトの保存先', associateConfirm: 'このフォルダーには project.json があります。保存時に上書きし、自動保存は project.json.bak を更新します。現在のプロジェクトを関連付けますか？', save: 'プロジェクトを保存', folder: 'プロジェクトフォルダーを開く', saved: '保存しました', failed: '保存に失敗しました', backupFailed: '自動バックアップに失敗しました', missing: '一部の素材が見つかりません', openFailed: 'フォルダーを開けません' },
});

// Keep desktop sessions outside graph nodes, including custom node serializers.
const nodeSessions = new WeakMap();

export function launcherProjectFor(node, apiURL) {
    if (!nodeSessions.has(node)) nodeSessions.set(node, new LauncherProject(apiURL));
    return nodeSessions.get(node);
}

export class LauncherProject {
    constructor(apiURL) {
        this.apiURL = apiURL;
        this.session = null;
        this.pending = Promise.resolve();
        this.lastBackup = null;
        this.queuedBackup = null;
    }

    async request(action, body) {
        const response = await fetch(this.apiURL(`/audio_keyframe_timeline/launcher_project/${action}`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || response.statusText);
        return data;
    }

    reset(session = null) {
        this.session = session;
        this.lastBackup = null;
        this.queuedBackup = null;
    }

    async open() {
        const directory = await window.__COMFYUI_LAUNCHER__.pickDirectory();
        if (!directory) return null;
        const opened = await this.request('open', { directory });
        if (!opened.versions) return opened;
        const filename = await chooseProjectVersion(opened.versions);
        return filename ? this.request('open', {directory, filename}) : null;
    }

    save(project, storyboard, backup, workflow = null) {
        const session = this.session;
        if (!session) return Promise.resolve(null);
        const snapshot = JSON.stringify({ project, storyboard });
        const workflowSnapshot = !backup && workflow ? JSON.stringify(workflow) : null;
        if (backup && (snapshot === this.lastBackup || snapshot === this.queuedBackup)) return Promise.resolve(null);
        if (backup) this.queuedBackup = snapshot;
        // Capture both destination and content before queuing: switching projects
        // must never redirect an in-flight write to the newly opened directory.
        const operation = this.pending.then(async () => {
            const result = await this.request('save', { token: session.token, ...JSON.parse(snapshot), backup,
                ...(workflowSnapshot ? { workflow: JSON.parse(workflowSnapshot) } : {}) });
            if (this.session === session && !result.missing?.length) this.lastBackup = snapshot;
            return result;
        });
        this.pending = operation.catch(() => {});
        return operation.finally(() => {
            if (this.session === session && this.queuedBackup === snapshot) this.queuedBackup = null;
        });
    }

    reveal() {
        return this.request('reveal', { token: this.session.token });
    }
}
