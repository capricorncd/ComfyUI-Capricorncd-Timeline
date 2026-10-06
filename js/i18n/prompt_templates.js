import { makeT } from '../cap_i18n.js';

export const t = makeT({
    en: {templates:'Prompt templates', references:'Insert reference description', manage:'Manage templates', name:'Template name', text:'Prompt', add:'New template', remove:'Delete', import:'Import', export:'Export', empty:'No named references in this prompt', no_description:'No description', stars:'{n} stars', error:'Could not save templates', saved:'Saved', imported:'Templates imported', hint:'Templates are saved in this browser. Higher star ratings appear first; equal ratings retain their order.', untitled:'New template'},
    zh: {templates:'提示词模板', references:'插入参考素材描述', manage:'模板管理', name:'模板名称', text:'提示词', add:'新增模板', remove:'删除', import:'导入', export:'导出', empty:'当前提示词没有 @参考素材', no_description:'未设置素材描述', stars:'{n} 星', error:'模板保存失败', saved:'已保存', imported:'模板已导入', hint:'模板保存在当前浏览器。按五星评分从高到低排序，同星级保留原顺序。', untitled:'新模板'},
    ja: {templates:'プロンプトテンプレート', references:'参照説明を挿入', manage:'テンプレート管理', name:'テンプレート名', text:'プロンプト', add:'新規テンプレート', remove:'削除', import:'インポート', export:'エクスポート', empty:'このプロンプトに参照素材がありません', no_description:'説明がありません', stars:'星 {n}', error:'保存できませんでした', saved:'保存しました', imported:'インポートしました', hint:'このブラウザに保存します。星の多い順に表示し、同じ評価では元の順序を維持します。', untitled:'新規テンプレート'},
});
