import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('public/icons',{recursive:true});
for(const size of [192,512])await sharp('public/favicon.svg').resize(size,size).png().toFile(`public/icons/icon-${size}.png`);
