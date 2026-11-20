import { build } from 'vite';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
await build({configFile:resolve('vite.standalone.config.ts')});
const root = resolve('public/local');
await cp('public/favicon.svg',`${root}/favicon.svg`);
const manifest = JSON.parse(await readFile('public/manifest.webmanifest','utf8'));
manifest.start_url='./index.html';manifest.scope='./';manifest.icons=manifest.icons.map(i=>({...i,src:i.src.replace(/^\//,'./')}));delete manifest.shortcuts;
await cp('public/icons',`${root}/icons`,{recursive:true});
await writeFile(`${root}/manifest.webmanifest`,JSON.stringify(manifest,null,2));
const files=[];
async function walk(dir,prefix='') { for(const e of await readdir(dir,{withFileTypes:true})) { if(e.isDirectory()) await walk(`${dir}/${e.name}`,`${prefix}${e.name}/`); else files.push(`${prefix}${e.name}`); } }
await walk(root);
await writeFile(`${root}/assets.json`,JSON.stringify(files));
const hash=createHash('sha256');for(const f of files)hash.update(await readFile(`${root}/${f}`));
const source=await readFile('scripts/sw-template.js','utf8');
hash.update(source);
const version=hash.digest('hex').slice(0,12);
await writeFile('public/sw.js',source.replace('__VERSION__',version).replace('__SHELL_ROOT__','/local/'));
// GitHub Pages and the hosted offline shell use precisely the same build.
const assetsDirectory=resolve('docs/assets');
if(!assetsDirectory.startsWith(resolve('docs')+sep))throw new Error('Generated assets must stay inside docs');
await rm(assetsDirectory,{recursive:true,force:true});
await mkdir(assetsDirectory,{recursive:true});
for(const f of files) {await mkdir(resolve('docs',f,'..'),{recursive:true});await cp(`${root}/${f}`,resolve('docs',f));}
await cp(`${root}/assets.json`,'docs/assets.json');
await writeFile('docs/sw.js',source.replace('__VERSION__',version).replace('__SHELL_ROOT__','./'));
console.log(`共享本地界面已生成：${files.length} 个文件；旧备份保持兼容。`);
