import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    acharInicioDeCluster, acharTrilhaDeVideo, extrairCabecalhoWebm, listarClusters,
    reescalarClusters, montarClipe, podarChunks, nomeArquivoClipe, clusterTemQuadroChave,
    RETENCAO_MAXIMA_MS, OPCOES_DURACAO_CLIPE,
} from '../core/clipes';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const arquivo = path.join(aqui, 'fixtures', 'gravacao-amostra.webm');

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

let amostra; // Uint8Array
function fatiar(bytes, tam = 15000, agora = 1000000) {
    const partes = [];
    for (let o = 0; o < bytes.length; o += tam) partes.push(bytes.slice(o, o + tam));
    return partes.map((p, i) => ({ blob: new Blob([p]), t: agora - (partes.length - 1 - i) * 1000 }));
}
async function bytesDoBlob(blob) { return new Uint8Array(await blob.arrayBuffer()); }

beforeAll(() => { amostra = new Uint8Array(fs.readFileSync(arquivo)); });

describe('clipes: fixture real', () => {
    it('acharInicioDeCluster encontra o offset 188', () => {
        expect(acharInicioDeCluster(amostra)).toBe(188);
    });

    it('acharInicioDeCluster com "desde" pula o primeiro cluster', () => {
        const seg = acharInicioDeCluster(amostra, 189);
        expect(seg).toBeGreaterThan(188);
    });

    it('acharTrilhaDeVideo le a trilha 2 do cabecalho real', () => {
        expect(acharTrilhaDeVideo(amostra.slice(0, 188))).toBe(2);
    });

    it('extrairCabecalhoWebm devolve blob de 188 bytes e trilhaVideo 2', async () => {
        const chunks = fatiar(amostra);
        const cab = await extrairCabecalhoWebm(chunks.map(c => c.blob));
        expect(cab).not.toBeNull();
        expect(cab.trilhaVideo).toBe(2);
        expect(cab.blob.size).toBe(188);
    });

    it('extrairCabecalhoWebm funciona com chunks minusculos (cabecalho espalhado em 3 chunks)', async () => {
        const chunks = fatiar(amostra.slice(0, 2000), 100);
        const cab = await extrairCabecalhoWebm(chunks.map(c => c.blob));
        expect(cab.blob.size).toBe(188);
    });

    it('extrairCabecalhoWebm retorna null sem cluster / lista vazia', async () => {
        expect(await extrairCabecalhoWebm([])).toBeNull();
        expect(await extrairCabecalhoWebm([new Blob([new Uint8Array(500)])])).toBeNull();
    });

    it('listarClusters acha os clusters, com tcs ordenados e chave so nos de quadro-chave', () => {
        const lista = listarClusters(amostra, 2);
        expect(lista.length).toBeGreaterThanOrEqual(8);
        const tcs = lista.map(c => c.tc);
        expect(tcs[0]).toBe(0);
        expect([...tcs].sort((a, b) => a - b)).toEqual(tcs);
        const chaves = lista.filter(c => c.chave).map(c => c.tc);
        expect(chaves).toHaveLength(3);
        expect(chaves[0]).toBe(0);
        expect(Math.abs(chaves[1] - 2070)).toBeLessThan(60);
        expect(Math.abs(chaves[2] - 4083)).toBeLessThan(60);
    });

    it('clusterTemQuadroChave: true para o primeiro cluster, false para o delta', () => {
        const lista = listarClusters(amostra, 2);
        expect(clusterTemQuadroChave(amostra, lista[0].pos, 2)).toBe(true);
        expect(clusterTemQuadroChave(amostra, lista[1].pos, 2)).toBe(false);
    });

    it('reescalarClusters(bytes, base) faz o primeiro cluster ter timecode 0', () => {
        const orig = listarClusters(amostra, 2);
        const base = orig[2].tc;
        const copia = amostra.slice(orig[2].pos);
        reescalarClusters(copia, base);
        const nova = listarClusters(copia, 2);
        expect(nova[0].tc).toBe(0);
        expect(nova[1].tc).toBe(orig[3].tc - base);
    });

    it('reescalarClusters nao deixa timecodes negativos', () => {
        const copia = amostra.slice();
        reescalarClusters(copia, 999999);
        listarClusters(copia, 2).forEach(c => expect(c.tc).toBe(0));
    });

    it('montarClipe(3s): cabecalho + cluster chave com timecode 0', async () => {
        const agora = 1000000;
        const chunks = fatiar(amostra, 15000, agora);
        const cab = await extrairCabecalhoWebm(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 3, agora);
        expect(clipe).not.toBeNull();
        expect(clipe.semCabecalho).toBe(false);
        expect(clipe.segundosReais).toBeGreaterThanOrEqual(3);
        const saida = await bytesDoBlob(clipe.blob);
        expect(Array.from(saida.slice(0, 188))).toEqual(Array.from(amostra.slice(0, 188)));
        expect(acharInicioDeCluster(saida)).toBe(188);
        const cl = listarClusters(saida, 2);
        expect(cl[0].tc).toBe(0);
        expect(cl[0].chave).toBe(true);
        expect(clipe.blob.type).toBe('video/webm');
    });

    it('montarClipe com duracao grande devolve desde o primeiro cluster', async () => {
        const agora = 1000000;
        const chunks = fatiar(amostra, 15000, agora);
        const cab = await extrairCabecalhoWebm(chunks.map(c => c.blob));
        const clipe = await montarClipe(chunks, cab, 600, agora);
        const saida = await bytesDoBlob(clipe.blob);
        expect(listarClusters(saida, 2).length).toBe(listarClusters(amostra, 2).length);
        expect(clipe.segundosReais).toBeGreaterThanOrEqual(6);
    });

    it('montarClipe retorna null com chunks vazios', async () => {
        expect(await montarClipe([], { blob: new Blob([]), trilhaVideo: 2 }, 3, Date.now())).toBeNull();
    });

    it('montarClipe retorna null sem quadro-chave no intervalo', async () => {
        const lista = listarClusters(amostra, 2);
        const soUltimo = amostra.slice(lista[lista.length - 1].pos);
        expect(lista[lista.length - 1].chave).toBe(false);
        const cab = { blob: new Blob([amostra.slice(0, 188)]), trilhaVideo: 2 };
        const r = await montarClipe([{ blob: new Blob([soUltimo]), t: 1000 }], cab, 3, 1000);
        expect(r).toBeNull();
    });

    it('montarClipe retorna null quando o buffer nao tem cluster nenhum', async () => {
        const cab = { blob: new Blob([amostra.slice(0, 188)]), trilhaVideo: 2 };
        const r = await montarClipe([{ blob: new Blob([new Uint8Array(1000)]), t: 1 }], cab, 3, 1);
        expect(r).toBeNull();
    });

    it('montarClipe sem cabecalho: trecho cru com semCabecalho true', async () => {
        const agora = 100000;
        const chunks = [
            { blob: new Blob(['aaa']), t: agora - 50000 },
            { blob: new Blob(['bbb']), t: agora - 2000 },
            { blob: new Blob(['ccc']), t: agora - 500 },
        ];
        const r = await montarClipe(chunks, null, 5, agora);
        expect(r.semCabecalho).toBe(true);
        expect(r.segundosReais).toBe(5);
        expect(r.blob.size).toBe(6);
    });

    it('montarClipe sem cabecalho e todos os chunks antigos: usa tudo', async () => {
        const chunks = [{ blob: new Blob(['aaa']), t: 1 }, { blob: new Blob(['bb']), t: 2 }];
        const r = await montarClipe(chunks, null, 5, 1000000);
        expect(r.blob.size).toBe(5);
    });
});

describe('clipes: podarChunks / nomeArquivoClipe', () => {
    it('descarta chunks mais antigos que a retencao, sem mutar', () => {
        const agora = 10000000;
        const lista = [
            { blob: 'a', t: agora - RETENCAO_MAXIMA_MS - 1 },
            { blob: 'b', t: agora - RETENCAO_MAXIMA_MS },
            { blob: 'c', t: agora },
        ];
        const r = podarChunks(lista, agora);
        expect(r.map(c => c.blob)).toEqual(['b', 'c']);
        expect(lista).toHaveLength(3);
    });
    it('aceita retencao customizada e lista vazia', () => {
        expect(podarChunks([], 5)).toEqual([]);
        expect(podarChunks([{ t: 0 }, { t: 90 }], 100, 20)).toEqual([{ t: 90 }]);
    });
    it('nomeArquivoClipe sanitiza o nome e formata carimbo', () => {
        const n = nomeArquivoClipe('Jo/ao <>:"|?*..\\x', 60, new Date('2026-01-02T03:04:05.678Z'));
        expect(n).toBe('clipe_Jo_ao_x_60s_2026-01-02T03-04-05.webm');
        expect(n).not.toMatch(/[\\/:*?"<>|]/);
    });
    it('nomeArquivoClipe usa Anonimo quando sem nome', () => {
        expect(nomeArquivoClipe('', 30, new Date(0))).toContain('clipe_Anonimo_30s_');
        expect(nomeArquivoClipe(null, 30, new Date(0))).toContain('clipe_Anonimo_');
    });
    it('OPCOES_DURACAO_CLIPE tem 30/60/120/300/600', () => {
        expect(OPCOES_DURACAO_CLIPE.map(o => o.segundos)).toEqual([30, 60, 120, 300, 600]);
    });
});

describe('clipes: robustez', () => {
    function rng(seed) { let s = seed; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

    it('bytes aleatorios nao lancam nem travam', () => {
        const r = rng(42);
        for (let k = 0; k < 200; k++) {
            const b = new Uint8Array(Math.floor(r() * 400));
            for (let i = 0; i < b.length; i++) b[i] = Math.floor(r() * 256);
            expect(() => { acharInicioDeCluster(b); listarClusters(b, 2); reescalarClusters(b.slice(), 5); acharTrilhaDeVideo(b); }).not.toThrow();
        }
    });

    it('amostra corrompida (bytes trocados) nao lanca', () => {
        const r = rng(7);
        for (let k = 0; k < 100; k++) {
            const b = amostra.slice();
            for (let j = 0; j < 30; j++) b[Math.floor(r() * b.length)] = Math.floor(r() * 256);
            expect(() => { listarClusters(b, 2); reescalarClusters(b, 1000); acharTrilhaDeVideo(b.slice(0, 188)); }).not.toThrow();
        }
    });

    it('buffers truncados em todo tamanho nao lancam', () => {
        for (let n = 0; n <= 700; n++) {
            const b = amostra.slice(0, n);
            expect(() => { acharInicioDeCluster(b); listarClusters(b, 2); acharTrilhaDeVideo(b); reescalarClusters(b, 3); }).not.toThrow();
        }
    });

    it('buffer vazio', () => {
        const b = new Uint8Array(0);
        expect(acharInicioDeCluster(b)).toBe(-1);
        expect(listarClusters(b, 2)).toEqual([]);
        expect(acharTrilhaDeVideo(b)).toBeNull();
        expect(reescalarClusters(b, 1)).toBe(b);
    });

    it('cluster com tamanho desconhecido nao trava', () => {
        const b = new Uint8Array([0x1F, 0x43, 0xB6, 0x75, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xE7, 0x81, 0x05]);
        const l = listarClusters(b, null);
        expect(l).toHaveLength(1);
        expect(l[0].tc).toBe(5);
    });

    it('acharTrilhaDeVideo: Segment de tamanho desconhecido com trilha de video 3', () => {
        const entrada = [0xAE, 0x86, 0xD7, 0x81, 0x03, 0x83, 0x81, 0x01];
        const audio = [0xAE, 0x86, 0xD7, 0x81, 0x01, 0x83, 0x81, 0x02];
        const tracks = [0x16, 0x54, 0xAE, 0x6B, 0x80 | (audio.length + entrada.length), ...audio, ...entrada];
        const b = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, ...tracks]);
        expect(acharTrilhaDeVideo(b)).toBe(3);
    });

    it('acharTrilhaDeVideo: so audio retorna null; primeira trilha de video vence', () => {
        const audio = [0xAE, 0x86, 0xD7, 0x81, 0x01, 0x83, 0x81, 0x02];
        const v1 = [0xAE, 0x86, 0xD7, 0x81, 0x05, 0x83, 0x81, 0x01];
        const v2 = [0xAE, 0x86, 0xD7, 0x81, 0x06, 0x83, 0x81, 0x01];
        const mk = (...e) => { const c = e.flat(); return new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xFF, 0x16, 0x54, 0xAE, 0x6B, 0x80 | c.length, ...c]); };
        expect(acharTrilhaDeVideo(mk(audio))).toBeNull();
        expect(acharTrilhaDeVideo(mk(audio, v1, v2))).toBe(5);
    });

    it('acharTrilhaDeVideo com Segment truncado no meio nao lanca', () => {
        const b = new Uint8Array([0x18, 0x53, 0x80, 0x67, 0xFF, 0x16, 0x54, 0xAE, 0x6B, 0x8F, 0xAE, 0x86, 0xD7]);
        expect(() => acharTrilhaDeVideo(b)).not.toThrow();
        expect(acharTrilhaDeVideo(b)).toBeNull();
    });
});
