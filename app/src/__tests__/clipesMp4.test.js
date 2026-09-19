// Testes do clipe sobre MP4 fragmentado (core/clipesMp4.js e o despacho em core/clipes.js).
//
// A fixture gravacao-amostra.mp4 e uma saida real do MediaRecorder (H.264 + AAC, ~9s):
//   ftyp+moov (1252 bytes), trilha 1 'vide' (escala 30000) e trilha 2 'soun' (escala 48000),
//   5 fragmentos moof+mdat, cada um comecando num quadro-chave. Os chunks do MediaRecorder
//   chegam nas fronteiras: 1252 | 120479 (fragmentos 1+2) | 60758 | 58586 | 31155 bytes.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    extrairCabecalhoMp4, listarFragmentosMp4, lerTrilhasDoMoov, montarClipeMp4,
} from '../core/clipesMp4';
import {
    extrairCabecalho, extensaoDoTipo, montarClipe, nomeArquivoClipe, MARGEM_QUADRO_CHAVE_MS,
} from '../core/clipes';
import { juntarBlobs, lerBytes } from '../core/bytesBlob';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(aqui, 'fixtures', 'gravacao-amostra.mp4');

function lerBlobComoBuffer(blob) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsArrayBuffer(blob);
    });
}

beforeAll(() => {
    if (typeof Blob.prototype.arrayBuffer !== 'function') {
        Blob.prototype.arrayBuffer = function () { return lerBlobComoBuffer(this); };
    }
});

const AGORA = 1_000_000;
const LIMITES = [1252, 120479, 60758, 58586, 31155];
const TAM_CABECALHO = 1252;

let amostra;
beforeAll(() => { amostra = new Uint8Array(fs.readFileSync(arquivo)); });

// Divide `bytes` nas fronteiras dadas; o ultimo chunk tem t = agora e os anteriores recuam `passoMs`.
function fatiar(bytes, tamanhos = LIMITES, passoMs = 2000, agora = AGORA) {
    const chunks = [];
    let o = 0;
    tamanhos.forEach(t => { chunks.push(bytes.slice(o, o + t)); o += t; });
    if (o < bytes.length) chunks.push(bytes.slice(o));
    return chunks.map((p, i) => ({ blob: new Blob([p]), t: agora - (chunks.length - 1 - i) * passoMs }));
}

async function bytesDoBlob(blob) { return new Uint8Array(await blob.arrayBuffer()); }

async function cabecalhoDaAmostra(chunks = fatiar(amostra)) {
    return extrairCabecalhoMp4(chunks.map(c => c.blob));
}

// tfdt (em unidades da trilha) do primeiro fragmento de cada trilha de um arquivo montado.
function tfdtPorTrilha(bytes, indiceFragmento = 0) {
    const f = listarFragmentosMp4(bytes)[indiceFragmento];
    const r = {};
    f.trafs.forEach(t => { r[t.id] = t.tfdt.valor; });
    return r;
}

// ---------------------------------------------------------------------------
// Construtor de MP4 sintetico (para versao 0/1 do tfdt, so audio, sem quadro-chave...)
// ---------------------------------------------------------------------------

const enc = new TextEncoder();
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0); return b; }
function u64(n) { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; }
function junta(...partes) {
    const total = partes.reduce((s, p) => s + p.length, 0);
    const r = new Uint8Array(total);
    let o = 0;
    partes.forEach(p => { r.set(p, o); o += p.length; });
    return r;
}
function caixa(tipo, ...partes) {
    const corpo = junta(...partes);
    return junta(u32(8 + corpo.length), enc.encode(tipo), corpo);
}

function trakSintetica({ id, tipo, escala, versao = 0 }) {
    const zeros = (n) => new Uint8Array(n);
    const tkhd = versao === 1
        ? caixa('tkhd', u32(0x01000000), zeros(16), u32(id), zeros(64))
        : caixa('tkhd', u32(0), zeros(8), u32(id), zeros(64));
    const mdhd = versao === 1
        ? caixa('mdhd', u32(0x01000000), zeros(16), u32(escala), zeros(16))
        : caixa('mdhd', u32(0), zeros(8), u32(escala), zeros(8));
    const hdlr = caixa('hdlr', u32(0), u32(0), enc.encode(tipo), zeros(12), enc.encode('x\0'));
    return caixa('trak', tkhd, caixa('mdia', mdhd, hdlr));
}

function cabecalhoSintetico(trilhas) {
    return junta(caixa('ftyp', enc.encode('isom'), u32(0), enc.encode('isom')), caixa('moov', ...trilhas.map(trakSintetica)));
}

// Fragmento com um traf por trilha: { id, tfdt, versaoTfdt, amostras, duracao, chave }
function fragmentoSintetico(trafs, tamMdat = 16) {
    const boxTrafs = trafs.map(({ id, tfdt, versaoTfdt = 0, amostras = 2, duracao = 1000, chave = true }) => {
        const flagsPadrao = chave ? 0x02000000 : 0x01010000;
        const tfhd = caixa('tfhd', u32(0x000028), u32(id), u32(duracao), u32(flagsPadrao));
        const tfdtBox = versaoTfdt === 1
            ? caixa('tfdt', u32(0x01000000), u64(tfdt))
            : caixa('tfdt', u32(0), u32(tfdt));
        const trun = caixa('trun', u32(0x000001), u32(amostras), u32(0));
        return caixa('traf', tfhd, tfdtBox, trun);
    });
    return junta(caixa('moof', caixa('mfhd', u32(0), u32(1)), ...boxTrafs), caixa('mdat', new Uint8Array(tamMdat).fill(0xAB)));
}

function comoChunks(partes, passoMs = 1000, agora = AGORA) {
    return partes.map((p, i) => ({ blob: new Blob([p]), t: agora - (partes.length - 1 - i) * passoMs }));
}

// ---------------------------------------------------------------------------

describe('bytesBlob', () => {
    it('lerBytes devolve os bytes do blob', async () => {
        expect(Array.from(await lerBytes(new Blob([new Uint8Array([1, 2, 3])])))).toEqual([1, 2, 3]);
    });

    it('juntarBlobs concatena na ordem e devolve uma copia', async () => {
        const r = await juntarBlobs([new Blob([new Uint8Array([1, 2])]), new Blob([new Uint8Array([3])]), new Blob([])]);
        expect(Array.from(r)).toEqual([1, 2, 3]);
    });

    it('juntarBlobs de lista vazia devolve Uint8Array vazia', async () => {
        const r = await juntarBlobs([]);
        expect(r).toBeInstanceOf(Uint8Array);
        expect(r.length).toBe(0);
    });
});

describe('clipesMp4: fixture real', () => {
    it('a fixture existe e tem o tamanho esperado', () => {
        expect(amostra.length).toBe(272230);
        expect(LIMITES.reduce((a, b) => a + b, 0)).toBe(amostra.length);
        expect(String.fromCharCode(...amostra.slice(4, 8))).toBe('ftyp');
    });

    describe('extrairCabecalhoMp4', () => {
        it('devolve ftyp+moov (1252 bytes) e as trilhas de video e audio', async () => {
            const cab = await cabecalhoDaAmostra();
            expect(cab.formato).toBe('mp4');
            expect(cab.blob.size).toBe(TAM_CABECALHO);
            expect(cab.trilhas).toEqual([
                { id: 1, tipo: 'vide', escala: 30000 },
                { id: 2, tipo: 'soun', escala: 48000 },
            ]);
        });

        it('o blob do cabecalho e identico aos primeiros 1252 bytes da fixture', async () => {
            const cab = await cabecalhoDaAmostra();
            expect(Array.from(await bytesDoBlob(cab.blob))).toEqual(Array.from(amostra.subarray(0, TAM_CABECALHO)));
        });

        it('so olha os 3 primeiros chunks (basta o primeiro fragmento aparecer neles)', async () => {
            const chunks = fatiar(amostra);
            const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob)); // 5 chunks: ignora os 2 ultimos
            expect(cab.blob.size).toBe(TAM_CABECALHO);
        });

        it('funciona com o arquivo inteiro num unico chunk', async () => {
            const cab = await extrairCabecalhoMp4([new Blob([amostra])]);
            expect(cab.blob.size).toBe(TAM_CABECALHO);
            expect(cab.trilhas).toHaveLength(2);
        });

        it('funciona com o cabecalho fatiado em pedacinhos', async () => {
            const cab = await extrairCabecalhoMp4([
                new Blob([amostra.slice(0, 100)]), new Blob([amostra.slice(100, 700)]), new Blob([amostra.slice(700)]),
            ]);
            expect(cab.blob.size).toBe(TAM_CABECALHO);
        });

        it('null quando so o cabecalho chegou (nenhum moof ainda)', async () => {
            expect(await extrairCabecalhoMp4([new Blob([amostra.slice(0, TAM_CABECALHO)])])).toBeNull();
        });

        it('null quando o moov esta incompleto', async () => {
            expect(await extrairCabecalhoMp4([new Blob([amostra.slice(0, 900)])])).toBeNull();
        });

        it('null para lista vazia, blob vazio e menos de 16 bytes', async () => {
            expect(await extrairCabecalhoMp4([])).toBeNull();
            expect(await extrairCabecalhoMp4([new Blob([])])).toBeNull();
            expect(await extrairCabecalhoMp4([new Blob([new Uint8Array(15)])])).toBeNull();
        });

        it('null para um webm (formato errado)', async () => {
            const webm = new Uint8Array(fs.readFileSync(path.join(aqui, 'fixtures', 'gravacao-amostra.webm')));
            expect(await extrairCabecalhoMp4([new Blob([webm.slice(0, 20000)])])).toBeNull();
        });
    });

    describe('lerTrilhasDoMoov', () => {
        it('le id, tipo do handler e escala de cada trak', () => {
            const cab = amostra.subarray(0, TAM_CABECALHO);
            const dv = new DataView(cab.buffer, cab.byteOffset, cab.byteLength);
            let p = 0;
            let moov = null;
            while (p + 8 <= cab.length) {
                const tam = dv.getUint32(p);
                const tipo = String.fromCharCode(...cab.subarray(p + 4, p + 8));
                if (tipo === 'moov') moov = { pos: p, tam, dados: p + 8 };
                p += tam;
            }
            expect(moov).not.toBeNull();
            expect(lerTrilhasDoMoov(cab, moov)).toEqual([
                { id: 1, tipo: 'vide', escala: 30000 },
                { id: 2, tipo: 'soun', escala: 48000 },
            ]);
        });
    });

    describe('listarFragmentosMp4', () => {
        it('lista os 5 fragmentos completos, com posicoes contiguas', () => {
            const fr = listarFragmentosMp4(amostra);
            expect(fr).toHaveLength(5);
            expect(fr[0].pos).toBe(TAM_CABECALHO);
            for (let i = 1; i < fr.length; i++) expect(fr[i].pos).toBe(fr[i - 1].fim);
            expect(fr[4].fim).toBe(amostra.length);
        });

        it('cada fragmento tem um traf de video (id 1) e um de audio (id 2), ambos quadro-chave', () => {
            listarFragmentosMp4(amostra).forEach(f => {
                expect(f.trafs.map(t => t.id).sort()).toEqual([1, 2]);
                f.trafs.forEach(t => expect(t.chave).toBe(true));
            });
        });

        it('o tfdt de cada trilha cresce de um fragmento para o outro', () => {
            const fr = listarFragmentosMp4(amostra);
            [1, 2].forEach(id => {
                const valores = fr.map(f => f.trafs.find(t => t.id === id).tfdt.valor);
                for (let i = 1; i < valores.length; i++) expect(valores[i]).toBeGreaterThan(valores[i - 1]);
            });
            expect(fr[0].trafs.find(t => t.id === 1).tfdt.valor).toBe(0);
        });

        it('duracao do video (escala 30000): ~2s por fragmento, ~1s o ultimo; total ~9s', () => {
            const fr = listarFragmentosMp4(amostra);
            const dur = fr.map(f => f.trafs.find(t => t.id === 1).duracao / 30000);
            dur.slice(0, 4).forEach(d => { expect(d).toBeGreaterThan(1.9); expect(d).toBeLessThan(2.1); });
            expect(dur[4]).toBeGreaterThan(0.8);
            expect(dur[4]).toBeLessThan(1.2);
            const ultimo = fr[4].trafs.find(t => t.id === 1);
            expect((ultimo.tfdt.valor + ultimo.duracao) / 30000).toBeGreaterThan(8.9);
            expect((ultimo.tfdt.valor + ultimo.duracao) / 30000).toBeLessThan(9.2);
        });

        it('a fixture usa tfdt versao 1 (64 bits) e a posicao aponta para o campo dentro do arquivo', () => {
            const fr = listarFragmentosMp4(amostra);
            const dv = new DataView(amostra.buffer, amostra.byteOffset, amostra.byteLength);
            const t = fr[1].trafs.find(x => x.id === 1).tfdt;
            expect(t.versao).toBe(1);
            expect(amostra[t.pos]).toBe(1);
            expect(Number(dv.getBigUint64(t.pos + 4))).toBe(t.valor);
        });

        it('ignora o fragmento final cortado no meio (cauda truncada)', () => {
            expect(listarFragmentosMp4(amostra.slice(0, amostra.length - 10))).toHaveLength(4);
            expect(listarFragmentosMp4(amostra.slice(0, 241075 + 20))).toHaveLength(4);
        });

        it('ignora um moof sem o mdat correspondente', () => {
            // corta exatamente entre moof e mdat do 2o fragmento
            const fr = listarFragmentosMp4(amostra);
            const dv = new DataView(amostra.buffer, amostra.byteOffset);
            const tamMoof = dv.getUint32(fr[1].pos);
            expect(listarFragmentosMp4(amostra.slice(0, fr[1].pos + tamMoof))).toHaveLength(1);
        });

        it('sem fragmentos: bytes vazios, so o cabecalho ou lixo curto', () => {
            expect(listarFragmentosMp4(new Uint8Array(0))).toEqual([]);
            expect(listarFragmentosMp4(amostra.slice(0, TAM_CABECALHO))).toEqual([]);
            expect(listarFragmentosMp4(new Uint8Array(7))).toEqual([]);
        });

        it('funciona sobre um subarray com byteOffset diferente de zero', () => {
            const grande = new Uint8Array(amostra.length + 37);
            grande.set(amostra, 37);
            const fr = listarFragmentosMp4(grande.subarray(37));
            expect(fr).toHaveLength(5);
            expect(fr[0].pos).toBe(TAM_CABECALHO);
        });
    });

    describe('montarClipeMp4 / montarClipe', () => {
        it('pedindo mais do que existe: cabecalho + todos os fragmentos (arquivo inteiro)', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 60, AGORA, 'video/mp4');
            expect(clipe).not.toBeNull();
            expect(clipe.semCabecalho).toBe(false);
            expect(clipe.blob.type).toBe('video/mp4');
            const saida = await bytesDoBlob(clipe.blob);
            expect(saida.length).toBe(amostra.length);
            expect(Array.from(saida.subarray(0, TAM_CABECALHO))).toEqual(Array.from(amostra.subarray(0, TAM_CABECALHO)));
            expect(tfdtPorTrilha(saida)).toEqual({ 1: 0, 2: 0 });
            expect(clipe.segundosReais).toBe(9);
        });

        it('montarClipe despacha para MP4 quando cabecalho.formato === "mp4" (mesmo resultado que montarClipeMp4)', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const a = await montarClipe(chunks, cab, 5, AGORA, 'video/mp4');
            const b = await montarClipeMp4(chunks, cab, 5, AGORA, MARGEM_QUADRO_CHAVE_MS, 'video/mp4');
            expect(a.segundosReais).toBe(b.segundosReais);
            expect(Array.from(await bytesDoBlob(a.blob))).toEqual(Array.from(await bytesDoBlob(b.blob)));
        });

        it('tipo padrao e video/mp4; tipo customizado (audio/mp4) vai para o Blob', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            expect((await montarClipeMp4(chunks, cab, 60, AGORA, MARGEM_QUADRO_CHAVE_MS)).blob.type).toBe('video/mp4');
            expect((await montarClipeMp4(chunks, cab, 60, AGORA, MARGEM_QUADRO_CHAVE_MS, 'audio/mp4')).blob.type).toBe('audio/mp4');
        });

        it('clipe curto comeca no quadro-chave (fragmento) mais proximo e recomeca os relogios em 0', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 3, AGORA, 'video/mp4');
            const saida = await bytesDoBlob(clipe.blob);

            // Fim ~9.0s; desde ~6.0s -> ultimo fragmento com inicio <= 6.0s comeca em ~4.01s (3 fragmentos: 3,4,5).
            const fr = listarFragmentosMp4(saida);
            expect(fr).toHaveLength(3);
            expect(saida.length).toBe(TAM_CABECALHO + (amostra.length - 121731));
            expect(Array.from(saida.subarray(0, TAM_CABECALHO))).toEqual(Array.from(amostra.subarray(0, TAM_CABECALHO)));

            const t0 = tfdtPorTrilha(saida, 0);
            expect(t0[1]).toBe(0);
            // audio comeca ~0.067s antes do video no original: recortado em 0 (nunca negativo).
            expect(t0[2]).toBeGreaterThanOrEqual(0);
            expect(t0[2]).toBeLessThan(0.1 * 48000);

            // os seguintes mantem a distancia original em relacao ao primeiro fragmento (video)
            const original = listarFragmentosMp4(amostra);
            const base = original[2].trafs.find(t => t.id === 1).tfdt.valor;
            expect(fr[1].trafs.find(t => t.id === 1).tfdt.valor).toBe(original[3].trafs.find(t => t.id === 1).tfdt.valor - base);
            expect(fr[2].trafs.find(t => t.id === 1).tfdt.valor).toBe(original[4].trafs.find(t => t.id === 1).tfdt.valor - base);
            expect(clipe.segundosReais).toBe(5);
        });

        it('segundosReais nunca e menor que o pedido (arredondado) quando ha material suficiente', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            for (const seg of [1, 2, 3, 4, 5, 6, 7, 8]) {
                const clipe = await montarClipe(chunks, cab, seg, AGORA, 'video/mp4');
                expect(clipe.segundosReais).toBeGreaterThanOrEqual(seg);
                expect(clipe.segundosReais).toBeLessThanOrEqual(9);
            }
        });

        it('a duracao real cresce com o pedido de forma monotona', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            let anterior = 0;
            for (const seg of [1, 3, 5, 7, 9, 30]) {
                const clipe = await montarClipe(chunks, cab, seg, AGORA, 'video/mp4');
                expect(clipe.segundosReais).toBeGreaterThanOrEqual(anterior);
                anterior = clipe.segundosReais;
            }
        });

        it('pedindo so 1s devolve pelo menos o ultimo fragmento com quadro-chave anterior', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 1, AGORA, 'video/mp4');
            const saida = await bytesDoBlob(clipe.blob);
            const fr = listarFragmentosMp4(saida);
            expect(fr.length).toBeGreaterThanOrEqual(1);
            expect(tfdtPorTrilha(saida)[1]).toBe(0);
        });

        it('so usa os chunks dentro da janela (pedido + margem): chunks antigos sao descartados', async () => {
            // chunks espacados de 30s: com pedido de 3s + margem de 20s so o ultimo (fragmento 5) entra.
            const chunks = fatiar(amostra, LIMITES, 30000);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 3, AGORA, 'video/mp4');
            const saida = await bytesDoBlob(clipe.blob);
            const fr = listarFragmentosMp4(saida);
            expect(fr).toHaveLength(1);
            expect(saida.length).toBe(TAM_CABECALHO + (amostra.length - 241075));
            const t = tfdtPorTrilha(saida);
            expect(t[1]).toBe(0);
            expect(t[2]).toBe(0); // audio do fragmento 5 comeca ~0.02s antes do video: nunca negativo
        });

        it('nao altera os blobs originais dos chunks (a copia e que e reescrita)', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            await montarClipe(chunks, cab, 3, AGORA, 'video/mp4');
            const original = await juntarBlobs(chunks.map(c => c.blob));
            expect(Array.from(original)).toEqual(Array.from(amostra));
        });

        it('so as posicoes do tfdt mudam: os demais bytes dos fragmentos escolhidos ficam identicos', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 3, AGORA, 'video/mp4');
            const saida = (await bytesDoBlob(clipe.blob)).subarray(TAM_CABECALHO);
            const origem = amostra.subarray(121731);
            expect(saida.length).toBe(origem.length);
            let diferentes = 0;
            for (let i = 0; i < saida.length; i++) if (saida[i] !== origem[i]) diferentes++;
            // 3 fragmentos x 2 trilhas x 8 bytes de tfdt no maximo
            expect(diferentes).toBeGreaterThan(0);
            expect(diferentes).toBeLessThanOrEqual(3 * 2 * 8);
        });

        it('funciona com o arquivo inteiro num unico chunk', async () => {
            const chunks = [{ blob: new Blob([amostra]), t: AGORA }];
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 4, AGORA, 'video/mp4');
            expect(clipe).not.toBeNull();
            expect(listarFragmentosMp4(await bytesDoBlob(clipe.blob)).length).toBeGreaterThanOrEqual(2);
        });

        it('a saida do clipe pode ser lida de novo: extrairCabecalhoMp4 acha o mesmo cabecalho', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 3, AGORA, 'video/mp4');
            const de_novo = await extrairCabecalhoMp4([clipe.blob]);
            expect(de_novo.trilhas).toEqual(cab.trilhas);
            expect(de_novo.blob.size).toBe(TAM_CABECALHO);
        });

        it('null para lista de chunks vazia', async () => {
            const cab = await cabecalhoDaAmostra();
            expect(await montarClipe([], cab, 30, AGORA, 'video/mp4')).toBeNull();
            expect(await montarClipeMp4([], cab, 30, AGORA, MARGEM_QUADRO_CHAVE_MS)).toBeNull();
        });

        it('montarClipeMp4 devolve null sem cabecalho', async () => {
            expect(await montarClipeMp4(fatiar(amostra), null, 30, AGORA, MARGEM_QUADRO_CHAVE_MS)).toBeNull();
        });

        it('null quando so o cabecalho chegou (nenhum fragmento completo)', async () => {
            const cab = await cabecalhoDaAmostra();
            const chunks = fatiar(amostra.slice(0, TAM_CABECALHO));
            expect(await montarClipe(chunks, cab, 30, AGORA, 'video/mp4')).toBeNull();
        });

        it('null quando o primeiro fragmento ainda esta incompleto', async () => {
            const cab = await cabecalhoDaAmostra();
            const chunks = fatiar(amostra.slice(0, TAM_CABECALHO + 5000), [TAM_CABECALHO]);
            expect(await montarClipe(chunks, cab, 30, AGORA, 'video/mp4')).toBeNull();
        });

        it('ignora o fragmento final truncado (gravacao em andamento) e usa os completos', async () => {
            const cab = await cabecalhoDaAmostra();
            const cortado = amostra.slice(0, amostra.length - 1000);
            const chunks = fatiar(cortado, LIMITES);
            const clipe = await montarClipe(chunks, cab, 60, AGORA, 'video/mp4');
            const saida = await bytesDoBlob(clipe.blob);
            expect(saida.length).toBe(241075); // cabecalho + fragmentos 1..4
            expect(listarFragmentosMp4(saida)).toHaveLength(4);
            expect(clipe.segundosReais).toBe(8);
        });

        it('nao trava nem quebra se o clipe e pedido com 0 ou segundos negativos', async () => {
            const chunks = fatiar(amostra);
            const cab = await cabecalhoDaAmostra(chunks);
            for (const seg of [0, -5]) {
                const clipe = await montarClipe(chunks, cab, seg, AGORA, 'video/mp4');
                expect(clipe === null || clipe.blob.size >= TAM_CABECALHO).toBe(true);
            }
        });

        it('chunk com t no futuro ou identico a agora nao quebra', async () => {
            const chunks = fatiar(amostra, LIMITES, 0);
            const cab = await cabecalhoDaAmostra(chunks);
            const clipe = await montarClipe(chunks, cab, 3, AGORA - 500000, 'video/mp4');
            expect(clipe).not.toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// MP4 sintetico
// ---------------------------------------------------------------------------

describe('clipesMp4: MP4 sintetico', () => {
    const VIDEO = { id: 1, tipo: 'vide', escala: 1000 };
    const AUDIO = { id: 2, tipo: 'soun', escala: 1000 };

    it('extrairCabecalhoMp4 le tkhd/mdhd de versao 0 e de versao 1', async () => {
        const f = fragmentoSintetico([{ id: 7, tfdt: 0 }]);
        const v0 = await extrairCabecalhoMp4([new Blob([junta(cabecalhoSintetico([{ id: 7, tipo: 'vide', escala: 25000, versao: 0 }]), f)])]);
        const v1 = await extrairCabecalhoMp4([new Blob([junta(cabecalhoSintetico([{ id: 7, tipo: 'vide', escala: 25000, versao: 1 }]), f)])]);
        expect(v0.trilhas).toEqual([{ id: 7, tipo: 'vide', escala: 25000 }]);
        expect(v1.trilhas).toEqual([{ id: 7, tipo: 'vide', escala: 25000 }]);
    });

    it('trilhas com escala 0 sao ignoradas; sem trilhas validas o cabecalho e null', async () => {
        const f = fragmentoSintetico([{ id: 1, tfdt: 0 }]);
        expect(await extrairCabecalhoMp4([new Blob([junta(cabecalhoSintetico([{ ...VIDEO, escala: 0 }]), f)])])).toBeNull();
        const cab = await extrairCabecalhoMp4([new Blob([junta(cabecalhoSintetico([{ ...VIDEO, escala: 0 }, AUDIO]), f)])]);
        expect(cab.trilhas).toEqual([{ id: 2, tipo: 'soun', escala: 1000 }]);
    });

    it('so audio: qualquer fragmento pode iniciar o clipe e o tfdt e recomecado em 0', async () => {
        const header = cabecalhoSintetico([AUDIO]);
        const frags = [0, 2000, 4000, 6000, 8000].map(t => fragmentoSintetico([{ id: 2, tfdt: t, duracao: 1000, amostras: 2 }]));
        const chunks = comoChunks([junta(header, frags[0]), ...frags.slice(1)]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        expect(cab.trilhas).toEqual([{ id: 2, tipo: 'soun', escala: 1000 }]);

        const clipe = await montarClipe(chunks, cab, 4, AGORA, 'audio/mp4');
        const saida = await bytesDoBlob(clipe.blob);
        const fr = listarFragmentosMp4(saida);
        // fim = 8 + 2 = 10s; desde = 6s -> comeca no fragmento de 6s (tfdt 6000): 6000, 8000
        expect(fr).toHaveLength(2);
        expect(fr.map(f => f.trafs[0].tfdt.valor)).toEqual([0, 2000]);
        expect(clipe.blob.type).toBe('audio/mp4');
        expect(clipe.segundosReais).toBe(4);
    });

    it('tfdt versao 0 (32 bits) e reescrito em 4 bytes', async () => {
        const header = cabecalhoSintetico([VIDEO, AUDIO]);
        const frags = [0, 2000, 4000].map(t => fragmentoSintetico([
            { id: 1, tfdt: t, versaoTfdt: 0 }, { id: 2, tfdt: t + 100, versaoTfdt: 0 },
        ]));
        const chunks = comoChunks([junta(header, frags[0]), frags[1], frags[2]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 2, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        // fim = 4+2 = 6s, desde = 4s -> comeca no fragmento de 4000
        expect(fr).toHaveLength(1);
        expect(fr[0].trafs.find(t => t.id === 1).tfdt).toMatchObject({ versao: 0, valor: 0 });
        expect(fr[0].trafs.find(t => t.id === 2).tfdt).toMatchObject({ versao: 0, valor: 100 });
    });

    it('tfdt versao 1 (64 bits) e reescrito em 8 bytes, inclusive com valores acima de 2^32', async () => {
        const grande = 2 ** 33; // nao cabe em 32 bits
        const header = cabecalhoSintetico([VIDEO, AUDIO]);
        const frags = [0, 2000, 4000].map(t => fragmentoSintetico([
            { id: 1, tfdt: grande + t, versaoTfdt: 1 }, { id: 2, tfdt: grande + t + 50, versaoTfdt: 1 },
        ]));
        const chunks = comoChunks([junta(header, frags[0]), frags[1], frags[2]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 2, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        expect(fr).toHaveLength(1);
        // grande = 2^33 units = ~8.6M s; o video vira 0 e o audio fica +50 (nao negativo)
        expect(fr[0].trafs.find(t => t.id === 1).tfdt).toMatchObject({ versao: 1, valor: 0 });
        expect(fr[0].trafs.find(t => t.id === 2).tfdt).toMatchObject({ versao: 1, valor: 50 });
    });

    it('tfdt reescrito nunca fica negativo (audio comecando antes do video)', async () => {
        const header = cabecalhoSintetico([VIDEO, AUDIO]);
        const frags = [
            fragmentoSintetico([{ id: 1, tfdt: 0 }, { id: 2, tfdt: 0 }]),
            fragmentoSintetico([{ id: 1, tfdt: 2000 }, { id: 2, tfdt: 1900 }]),
        ];
        const chunks = comoChunks([junta(header, frags[0]), frags[1]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 1, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        expect(fr[0].trafs.find(t => t.id === 2).tfdt.valor).toBe(0);
        expect(fr[0].trafs.find(t => t.id === 1).tfdt.valor).toBe(0);
    });

    it('fragmentos sem quadro-chave nao podem iniciar o clipe: escolhe o ultimo chave anterior', async () => {
        const header = cabecalhoSintetico([VIDEO]);
        const frags = [
            fragmentoSintetico([{ id: 1, tfdt: 0, chave: true }]),
            fragmentoSintetico([{ id: 1, tfdt: 2000, chave: false }]),
            fragmentoSintetico([{ id: 1, tfdt: 4000, chave: false }]),
        ];
        const chunks = comoChunks([junta(header, frags[0]), frags[1], frags[2]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 2, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        expect(fr).toHaveLength(3); // volta ate o unico quadro-chave (tfdt 0)
        expect(fr.map(f => f.trafs[0].tfdt.valor)).toEqual([0, 2000, 4000]);
    });

    it('sem nenhum quadro-chave no video: null', async () => {
        const header = cabecalhoSintetico([VIDEO]);
        const frags = [0, 2000].map(t => fragmentoSintetico([{ id: 1, tfdt: t, chave: false }]));
        const chunks = comoChunks([junta(header, frags[0]), frags[1]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        expect(await montarClipe(chunks, cab, 2, AGORA, 'video/mp4')).toBeNull();
    });

    it('quando so ha quadro-chave depois do ponto pedido, comeca nele (clipe mais curto)', async () => {
        const header = cabecalhoSintetico([VIDEO]);
        const frags = [
            fragmentoSintetico([{ id: 1, tfdt: 0, chave: false }]),
            fragmentoSintetico([{ id: 1, tfdt: 2000, chave: false }]),
            fragmentoSintetico([{ id: 1, tfdt: 4000, chave: true }]),
        ];
        const chunks = comoChunks([junta(header, frags[0]), frags[1], frags[2]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 5, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        expect(fr).toHaveLength(1);
        expect(fr[0].trafs[0].tfdt.valor).toBe(0);
    });

    it('trak no cabecalho que nao existe nos fragmentos (traf de id desconhecido) e preservado sem reescrever', async () => {
        const header = cabecalhoSintetico([VIDEO]);
        const frags = [0, 2000].map(t => fragmentoSintetico([{ id: 1, tfdt: t }, { id: 99, tfdt: 12345 }]));
        const chunks = comoChunks([junta(header, frags[0]), frags[1]]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 2, AGORA, 'video/mp4');
        const fr = listarFragmentosMp4(await bytesDoBlob(clipe.blob));
        expect(fr[0].trafs.find(t => t.id === 99).tfdt.valor).toBe(12345);
    });

    it('trun sem flags de amostra e sem duracao padrao: duracao 0 (nao quebra; assume 1s no calculo do fim)', async () => {
        const header = cabecalhoSintetico([AUDIO]);
        const f = fragmentoSintetico([{ id: 2, tfdt: 0, duracao: 0, amostras: 3 }]);
        const chunks = comoChunks([junta(header, f)]);
        const cab = await extrairCabecalhoMp4(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 10, AGORA, 'audio/mp4');
        expect(clipe).not.toBeNull();
        expect(clipe.segundosReais).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Dados corrompidos / truncados: nunca lancam nem travam
// ---------------------------------------------------------------------------

function prng(semente) {
    let a = semente >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

async function exercitar(bytes) {
    const erros = [];
    const tentar = async (nome, fn) => { try { await fn(); } catch (e) { erros.push(`${nome}: ${e && e.message}`); } };
    let cab = null;
    await tentar('extrairCabecalhoMp4', async () => { cab = await extrairCabecalhoMp4([new Blob([bytes])]); });
    await tentar('listarFragmentosMp4', async () => { listarFragmentosMp4(bytes); });
    if (cab) {
        await tentar('montarClipe', async () => {
            await montarClipe([{ blob: new Blob([bytes]), t: AGORA }], cab, 30, AGORA, 'video/mp4');
        });
    }
    return erros;
}

describe('clipesMp4: entradas corrompidas e truncadas', () => {
    it('100 buffers aleatorios (0..3000 bytes) nunca lancam', async () => {
        const rnd = prng(12345);
        const falhas = [];
        for (let i = 0; i < 100; i++) {
            const b = new Uint8Array(Math.floor(rnd() * 3000));
            for (let j = 0; j < b.length; j++) b[j] = Math.floor(rnd() * 256);
            const erros = await exercitar(b);
            if (erros.length) falhas.push(`#${i} (len ${b.length}): ${erros.join('; ')}`);
        }
        expect(falhas).toEqual([]);
    });

    it('100 buffers aleatorios que comecam com caixas MP4 plausiveis nunca lancam', async () => {
        const rnd = prng(777);
        const tipos = ['ftyp', 'moov', 'moof', 'mdat', 'traf', 'tfhd', 'tfdt', 'trun', 'trak', 'mdia'];
        const falhas = [];
        for (let i = 0; i < 100; i++) {
            const partes = [];
            const n = 1 + Math.floor(rnd() * 8);
            for (let k = 0; k < n; k++) {
                const corpo = new Uint8Array(Math.floor(rnd() * 60));
                for (let j = 0; j < corpo.length; j++) corpo[j] = Math.floor(rnd() * 256);
                partes.push(caixa(tipos[Math.floor(rnd() * tipos.length)], corpo));
            }
            const erros = await exercitar(junta(...partes));
            if (erros.length) falhas.push(`#${i}: ${erros.join('; ')}`);
        }
        expect(falhas).toEqual([]);
    });

    it('a fixture truncada em qualquer ponto (passo de 997 bytes) nunca lanca e so lista fragmentos completos', async () => {
        const original = listarFragmentosMp4(amostra);
        const falhas = [];
        for (let n = 0; n <= amostra.length; n += 997) {
            const parte = amostra.slice(0, n);
            const erros = await exercitar(parte);
            if (erros.length) falhas.push(`len ${n}: ${erros.join('; ')}`);
            const esperados = original.filter(f => f.fim <= n).length;
            expect(listarFragmentosMp4(parte)).toHaveLength(esperados);
        }
        expect(falhas).toEqual([]);
    });

    it('a fixture truncada em cada fronteira de caixa e em +-1 byte dela nunca lanca', async () => {
        const original = listarFragmentosMp4(amostra);
        const pontos = new Set([0, 1, 7, 8, 9, TAM_CABECALHO - 1, TAM_CABECALHO, TAM_CABECALHO + 1]);
        original.forEach(f => { [f.pos - 1, f.pos, f.pos + 1, f.pos + 8, f.fim - 1, f.fim, f.fim + 1].forEach(p => pontos.add(p)); });
        const falhas = [];
        for (const n of pontos) {
            if (n < 0 || n > amostra.length) continue;
            const erros = await exercitar(amostra.slice(0, n));
            if (erros.length) falhas.push(`len ${n}: ${erros.join('; ')}`);
        }
        expect(falhas).toEqual([]);
    });

    it('100 mutacoes da fixture (1 a 8 bytes trocados nos primeiros 3KB, ou seja no moov/moof) nunca lancam', async () => {
        const rnd = prng(2024);
        const base = amostra.slice(0, 65000); // ftyp+moov+1o fragmento
        const falhas = [];
        for (let i = 0; i < 100; i++) {
            const b = base.slice();
            const trocas = 1 + Math.floor(rnd() * 8);
            for (let k = 0; k < trocas; k++) b[Math.floor(rnd() * 3000)] = Math.floor(rnd() * 256);
            const erros = await exercitar(b);
            if (erros.length) falhas.push(`#${i}: ${erros.join('; ')}`);
        }
        expect(falhas).toEqual([]);
    });

    it('caixa com tamanho 0 (ate o fim) e tamanho 1 (64 bits) sao lidas sem travar', () => {
        const mdat0 = junta(u32(0), enc.encode('mdat'), new Uint8Array(20));
        expect(() => listarFragmentosMp4(mdat0)).not.toThrow();
        const grande = junta(u32(1), enc.encode('mdat'), u64(16 + 4), new Uint8Array(4));
        expect(() => listarFragmentosMp4(grande)).not.toThrow();
        const truncado64 = junta(u32(1), enc.encode('mdat'), new Uint8Array(3));
        expect(() => listarFragmentosMp4(truncado64)).not.toThrow();
    });

    it('caixa com tamanho menor que o proprio cabecalho para o parse (sem loop infinito)', () => {
        const ruim = junta(u32(4), enc.encode('moof'), new Uint8Array(40));
        expect(listarFragmentosMp4(ruim)).toEqual([]);
    });

    // Regressão: trun sem campos por amostra (flags sem 0x100/0x200/0x400/0x800) e contagem gigante travava
    // a thread ~47s (o laço nunca chegava ao limite da caixa). Agora o laço é limitado ao tamanho da caixa.
    it('trun declarando 4 bilhoes de amostras (sem campos por amostra) nao trava por muito tempo', () => {
        const tfhd = caixa('tfhd', u32(0x08), u32(1), u32(1000));
        const tfdt = caixa('tfdt', u32(0), u32(0));
        const trun = caixa('trun', u32(0), u32(0xFFFFFFFF));
        const arq = junta(caixa('moof', caixa('traf', tfhd, tfdt, trun)), caixa('mdat', new Uint8Array(4)));
        const t0 = Date.now();
        listarFragmentosMp4(arq);
        expect(Date.now() - t0).toBeLessThan(2000);
    }, 30000);
});

// ---------------------------------------------------------------------------
// clipes.js: despacho por formato
// ---------------------------------------------------------------------------

describe('clipes.js: extrairCabecalho / extensaoDoTipo / nomeArquivoClipe', () => {
    it('extrairCabecalho despacha para MP4 quando o tipo contem "mp4"', async () => {
        const chunks = fatiar(amostra).map(c => c.blob);
        for (const tipo of ['video/mp4', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'audio/mp4', 'VIDEO/MP4']) {
            const cab = await extrairCabecalho(chunks, tipo);
            expect(cab.formato).toBe('mp4');
            expect(cab.trilhas).toHaveLength(2);
        }
    });

    it('extrairCabecalho usa o leitor de webm para webm (formato: "webm") e devolve null para MP4 lido como webm', async () => {
        const webm = new Uint8Array(fs.readFileSync(path.join(aqui, 'fixtures', 'gravacao-amostra.webm')));
        const cab = await extrairCabecalho([new Blob([webm.slice(0, 40000)])], 'video/webm');
        expect(cab.formato).toBe('webm');
        expect(cab.blob.size).toBe(188);
        // um mp4 lido como webm nao acha Cluster
        expect(await extrairCabecalho(fatiar(amostra).map(c => c.blob), 'video/webm')).toBeNull();
    });

    it('extrairCabecalho com tipo ausente cai no webm', async () => {
        expect(await extrairCabecalho(fatiar(amostra).map(c => c.blob), undefined)).toBeNull();
        expect(await extrairCabecalho(fatiar(amostra).map(c => c.blob), '')).toBeNull();
    });

    it.each([
        ['video/mp4', 'mp4'],
        ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
        ['audio/mp4;codecs=mp4a.40.2', 'm4a'],
        ['video/webm', 'webm'],
        ['audio/webm', 'webm'],
        ['video/webm;codecs=vp9', 'webm'],
        ['', 'webm'],
        [undefined, 'webm'],
        [null, 'webm'],
    ])('extensaoDoTipo(%s) -> %s', (tipo, ext) => {
        expect(extensaoDoTipo(tipo)).toBe(ext);
    });

    it('nomeArquivoClipe usa a extensao pedida (padrao webm)', () => {
        const d = new Date('2026-01-02T03:04:05.678Z');
        expect(nomeArquivoClipe('Ana', 60, d)).toBe('clipe_Ana_60s_2026-01-02T03-04-05.webm');
        expect(nomeArquivoClipe('Ana', 60, d, 'mp4')).toBe('clipe_Ana_60s_2026-01-02T03-04-05.mp4');
        expect(nomeArquivoClipe('Ana', 30, d, extensaoDoTipo('video/mp4;codecs=avc1.42E01E,mp4a.40.2'))).toMatch(/_30s_.*\.mp4$/);
    });

    it('nomeArquivoClipe sanitiza o nome e usa "Anonimo" sem nome, mantendo a extensao', () => {
        const d = new Date('2026-01-02T03:04:05Z');
        expect(nomeArquivoClipe('João Ricardo #1', 5, d, 'mp4')).toBe('clipe_Jo_o_Ricardo_1_5s_2026-01-02T03-04-05.mp4');
        expect(nomeArquivoClipe('', 5, d, 'mp4')).toBe('clipe_Anonimo_5s_2026-01-02T03-04-05.mp4');
        expect(nomeArquivoClipe(null, 5, d, 'm4a')).toMatch(/^clipe_Anonimo_5s_.*\.m4a$/);
    });

    it('montarClipe com cabecalho MP4 e chunks vazios retorna null sem consultar o cabecalho', async () => {
        expect(await montarClipe([], { formato: 'mp4', blob: new Blob([]), trilhas: [] }, 30, AGORA, 'video/mp4')).toBeNull();
    });
});
