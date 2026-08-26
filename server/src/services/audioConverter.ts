/**
 * audioConverter.ts
 * Converte áudio para .ogg/opus compatível com nota de voz do WhatsApp
 */

import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";

// Configura caminho do ffmpeg
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const TEMP_DIR = path.join(process.cwd(), "temp");

// Garante que a pasta temp existe
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Converte arquivo de áudio para .ogg com codec opus
 * @param inputPath Caminho do arquivo de áudio original
 * @returns Caminho do arquivo .ogg convertido
 */
export function converterParaOgg(inputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputFilename = `${uuid()}.ogg`;
    const outputPath = path.join(TEMP_DIR, outputFilename);

    ffmpeg(inputPath)
      .toFormat("ogg")
      .audioCodec("libopus")
      .audioBitrate("64k")
      .audioChannels(1)
      .audioFrequency(48000)
      .on("end", () => resolve(outputPath))
      .on("error", (err: Error) => reject(err))
      .save(outputPath);
  });
}

/**
 * Remove arquivo temporário
 */
export function limparTemp(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignora erros de limpeza
  }
}
