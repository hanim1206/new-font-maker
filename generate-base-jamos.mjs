import { CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP } from './src/data/Hangul.ts';
import fs from 'fs';

const baseJamos = {
  version: '1.0.0',
  choseong: CHOSEONG_MAP,
  jungseong: JUNGSEONG_MAP,
  jongseong: JONGSEONG_MAP,
};

fs.writeFileSync(
  './src/data/baseJamos.json',
  JSON.stringify(baseJamos, null, 2),
  'utf-8'
);

console.log('✅ baseJamos.json created');
