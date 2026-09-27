import type { Voice } from '../types';

export interface VoiceOption {
  value: Voice;
  name: string;
  label: string;
  previewStem: string;
}

// The names are VieNeu v3 Turbo preset IDs. previewStem intentionally follows
// the user's existing E:\\ai-rdvd-ui\\audio filenames, including the two stems
// whose spelling differs from the preset (Phạm-Tuyền / Xuân-Vinh).
export const VOICE_OPTIONS: readonly VoiceOption[] = [
  { value: 'minh-duc', name: 'Minh Đức', label: '01 · Minh Đức — Nam · Bắc · Tin tức', previewStem: '01-Minh-Đức' },
  { value: 'pham-tuyen', name: 'Phạm Tuyên', label: '02 · Phạm Tuyên — Nam · Bắc · Tự nhiên', previewStem: '02-Phạm-Tuyền' },
  { value: 'thai-son', name: 'Thái Sơn', label: '03 · Thái Sơn — Nam · Nam · Kể chuyện', previewStem: '03-Thái-Sơn' },
  { value: 'xuan-vinh', name: 'Xuân Vĩnh', label: '04 · Xuân Vĩnh — Nam · Bắc · Tự nhiên', previewStem: '04-Xuân-Vinh' },
  { value: 'thanh-binh', name: 'Thanh Bình', label: '05 · Thanh Bình — Nam · Bắc · Kể chuyện', previewStem: '05-Thanh-Bình' },
  { value: 'truc-ly', name: 'Trúc Ly', label: '06 · Trúc Ly — Nữ · Bắc · Tự nhiên', previewStem: '06-Trúc-Ly' },
  { value: 'ngoc-linh', name: 'Ngọc Linh', label: '07 · Ngọc Linh — Nữ · Bắc · Kể chuyện', previewStem: '07-Ngọc-Linh' },
  { value: 'doan-trang', name: 'Đoan Trang', label: '08 · Đoan Trang — Nữ · Bắc · Tự nhiên', previewStem: '08-Đoan-Trang' },
  { value: 'mai-anh', name: 'Mai Anh', label: '09 · Mai Anh — Nữ · Bắc · Tin tức', previewStem: '09-Mai-Anh' },
  { value: 'thuc-doan', name: 'Thục Đoan', label: '10 · Thục Đoan — Nữ · Nam · Kể chuyện', previewStem: '10-Thục-Đoan' },
  { value: 'minh-triet', name: 'Minh Triết', label: '11 · Minh Triết — Nam · Nam · Tin tức', previewStem: '11-Minh-Triết' },
  { value: 'thuy-dung', name: 'Thùy Dung', label: '12 · Thùy Dung — Nữ · Nam · Tin tức', previewStem: '12-Thùy-Dung' },
  { value: 'quang-son', name: 'Quang Sơn', label: '13 · Quang Sơn — Nam · Trung · Tự nhiên', previewStem: '13-Quang-Sơn' },
  { value: 'ngoc-tran', name: 'Ngọc Trân', label: '14 · Ngọc Trân — Nữ · Trung · Tự nhiên', previewStem: '14-Ngọc-Trân' },
  { value: 'my-duyen', name: 'Mỹ Duyên', label: '15 · Mỹ Duyên — Nữ · Nam · Đọc truyện', previewStem: '15-Mỹ-Duyên' },
  { value: 'quynh-anh', name: 'Quỳnh Anh', label: '16 · Quỳnh Anh — Nữ · Bắc · Đọc truyện', previewStem: '16-Quỳnh-Anh' },
  { value: 'duc-tri', name: 'Đức Trí', label: '17 · Đức Trí — Nam · Nam · Đọc truyện', previewStem: '17-Đức-Trí' },
  { value: 'kim-thanh', name: 'Kim Thanh', label: '18 · Kim Thanh — Nữ · Nam · Đọc truyện', previewStem: '18-Kim-Thanh' },
  { value: 'ngoc-huyen', name: 'Ngọc Huyền', label: '19 · Ngọc Huyền — Nữ · Bắc · Tự nhiên', previewStem: '19-Ngọc-Huyền' },
  { value: 'adam', name: 'Adam', label: '20 · Adam — Nam · Nam · Tự nhiên', previewStem: '20-Adam' },
  { value: 'manh-dung', name: 'Mạnh Dũng', label: '21 · Mạnh Dũng — Nam · Bắc · Tự nhiên', previewStem: '21-Mạnh-Dũng' },
  { value: 'minh-quan', name: 'Minh Quân', label: '22 · Minh Quân — Nam · Bắc · Tự nhiên', previewStem: '22-Minh-Quân' },
  { value: 'anh-khoi', name: 'Anh Khôi', label: '23 · Anh Khôi — Nam · Bắc · Kể chuyện', previewStem: '23-Anh-Khôi' },
] as const;

export const DEFAULT_VOICE: Voice = 'minh-duc';

export function getVoiceOption(voice: Voice) {
  return VOICE_OPTIONS.find((option) => option.value === voice) ?? VOICE_OPTIONS[0];
}
