import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import './training_dataset/Editor.js';
import { T } from './training_dataset/i18n.js';
import { copyDatasetData } from './training_dataset/model.js';

app.registerExtension({
    name:'Capricorncd.TrainingDataset',
    beforeRegisterNodeDef(nodeType,nodeData) {
        if(nodeData.name!=='CAP_TrainingDataset')return;
        const created=nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated=function() {
            created?.apply(this,arguments);
            const button=document.createElement('cap-button');button.textContent=T('open');
            let editor;
            button.onclick=()=> {
                if(editor?.isConnected)return;
                editor=document.createElement('cap-training-dataset-editor');
                void editor.open(this.properties?.training_dataset || {},state=> {
                    this.properties ||= {};this.properties.training_dataset=copyDatasetData(state);this.setDirtyCanvas(true,true);
                },path=>api.apiURL(path)).catch(error=> {
                    editor.status?.setStatus(error.message,'error');
                });
            };
            const widget=this.addDOMWidget('training_dataset','button',button,{getMinHeight:()=>36,getHeight:()=>36});
            widget.serialize=false;widget.computeLayoutSize=()=>({minHeight:36,maxHeight:36});
            this.size=[300,90];
            const serialize=this.onSerialize;
            this.onSerialize=function(info){
                if(editor?.isConnected)editor.save();
                serialize?.apply(this,arguments);
                if(this.properties?.training_dataset){
                    info.properties ||= {};
                    info.properties.training_dataset=copyDatasetData(this.properties.training_dataset);
                }
            };
            const removed=this.onRemoved;
            this.onRemoved=function(){editor?.remove();removed?.apply(this,arguments);};
        };
    },
});
