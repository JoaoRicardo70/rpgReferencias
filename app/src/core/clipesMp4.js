// Clipe (replay dos últimos instantes) sobre a saída MP4 fragmentado do MediaRecorder.
//
// Estrutura: ftyp + moov (cabeçalho, com mvex) e depois pares moof + mdat (fragmentos). Com quadro-chave
// a cada 2s, cada fragmento começa num quadro-chave, então basta cortar entre fragmentos: clipe =
// cabeçalho + fragmentos a partir do escolhido, com o baseMediaDecodeTime (tfdt) de cada trilha
// reescrito para começar em 0 (senão o player espera pelo tempo original e fica parado/preto).

import { juntarBlobs } from './bytesBlob';

const BIT_NAO_SINCRONIZADO = 0x00010000; // sample_is_non_sync_sample

// Lista as caixas (boxes) entre `ini` e `fim`: { tipo, pos, tam, dados }. Para se a caixa for inválida.
function lerCaixas(bytes, dv, ini, fim) {
    const caixas = [];
    let p = ini;
    while (p + 8 <= fim) {
        let tam = dv.getUint32(p);
        const tipo = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
        let cabecalho = 8;
        if (tam === 1) {
            if (p + 16 > fim) break;
            tam = Number(dv.getBigUint64(p + 8));
            cabecalho = 16;
        } else if (tam === 0) {
            tam = fim - p;
        }
        if (tam < cabecalho) break;
        caixas.push({ tipo, pos: p, tam, dados: p + cabecalho, completa: p + tam <= fim });
        p += tam;
    }
    return caixas;
}

function visualizar(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// Trilhas descritas no moov: [{ id, tipo: 'vide'|'soun'|..., escala }].
export function lerTrilhasDoMoov(bytes, moov) {
    const dv = visualizar(bytes);
    const trilhas = [];
    lerCaixas(bytes, dv, moov.dados, moov.pos + moov.tam).filter(c => c.tipo === 'trak').forEach(trak => {
        const filhos = lerCaixas(bytes, dv, trak.dados, trak.pos + trak.tam);
        const tkhd = filhos.find(c => c.tipo === 'tkhd');
        const mdia = filhos.find(c => c.tipo === 'mdia');
        if (!tkhd || !mdia) return;
        const id = dv.getUint32(tkhd.dados + (bytes[tkhd.dados] === 1 ? 20 : 12));
        const dentro = lerCaixas(bytes, dv, mdia.dados, mdia.pos + mdia.tam);
        const mdhd = dentro.find(c => c.tipo === 'mdhd');
        const hdlr = dentro.find(c => c.tipo === 'hdlr');
        if (!mdhd || !hdlr) return;
        const escala = dv.getUint32(mdhd.dados + (bytes[mdhd.dados] === 1 ? 20 : 12));
        const o = hdlr.dados + 8;
        const tipo = String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
        if (escala > 0) trilhas.push({ id, tipo, escala });
    });
    return trilhas;
}

// Cabeçalho = tudo antes do primeiro moof (ftyp + moov). Retorna { formato, blob, trilhas } ou null.
export async function extrairCabecalhoMp4(chunksIniciais) {
    const bytes = await juntarBlobs(chunksIniciais.slice(0, 3));
    if (bytes.length < 16) return null;
    const dv = visualizar(bytes);
    const caixas = lerCaixas(bytes, dv, 0, bytes.length);
    const moov = caixas.find(c => c.tipo === 'moov' && c.completa);
    const moof = caixas.find(c => c.tipo === 'moof');
    if (!moov || !moof || moof.pos < moov.pos + moov.tam) return null;
    let trilhas = [];
    try { trilhas = lerTrilhasDoMoov(bytes, moov); } catch (e) { return null; }
    if (trilhas.length === 0) return null;
    return { formato: 'mp4', blob: new Blob([bytes.slice(0, moof.pos)]), trilhas };
}

// Lê um traf: { id, tfdt: { pos, versao, valor }, chave, duracao (em unidades da trilha) }.
function lerTraf(bytes, dv, traf) {
    const filhos = lerCaixas(bytes, dv, traf.dados, traf.pos + traf.tam);
    const tfhd = filhos.find(c => c.tipo === 'tfhd');
    const tfdt = filhos.find(c => c.tipo === 'tfdt');
    const trun = filhos.find(c => c.tipo === 'trun');
    if (!tfhd || !tfdt || !trun) return null;

    const flagsTfhd = dv.getUint32(tfhd.dados) & 0xFFFFFF;
    const id = dv.getUint32(tfhd.dados + 4);
    let o = tfhd.dados + 8;
    if (flagsTfhd & 0x1) o += 8;
    if (flagsTfhd & 0x2) o += 4;
    let duracaoPadrao = 0;
    if (flagsTfhd & 0x8) { duracaoPadrao = dv.getUint32(o); o += 4; }
    if (flagsTfhd & 0x10) o += 4;
    const flagsPadrao = (flagsTfhd & 0x20) ? dv.getUint32(o) : null;

    const versaoTfdt = bytes[tfdt.dados];
    const valor = versaoTfdt === 1 ? Number(dv.getBigUint64(tfdt.dados + 4)) : dv.getUint32(tfdt.dados + 4);

    const flagsTrun = dv.getUint32(trun.dados) & 0xFFFFFF;
    const amostras = dv.getUint32(trun.dados + 4);
    let q = trun.dados + 8;
    if (flagsTrun & 0x1) q += 4;
    let flagsPrimeira = null;
    if (flagsTrun & 0x4) { flagsPrimeira = dv.getUint32(q); q += 4; }
    let duracao = 0;
    const tamanhoAmostra = ((flagsTrun & 0x100) ? 4 : 0) + ((flagsTrun & 0x200) ? 4 : 0) + ((flagsTrun & 0x400) ? 4 : 0) + ((flagsTrun & 0x800) ? 4 : 0);
    // Nunca lê além da caixa: um trun corrompido com contagem gigante (ou sem campos por amostra) não trava.
    const cabemNaCaixa = tamanhoAmostra ? Math.floor((trun.pos + trun.tam - q) / tamanhoAmostra) : 0;
    const lidas = Math.max(0, Math.min(amostras, cabemNaCaixa));
    if (!tamanhoAmostra) duracao = Math.min(amostras, 1e6) * duracaoPadrao;
    for (let i = 0; i < lidas; i++) {
        const base = q + i * tamanhoAmostra;
        if (base + tamanhoAmostra > trun.pos + trun.tam) break;
        if (i === 0 && flagsPrimeira === null && (flagsTrun & 0x400)) {
            flagsPrimeira = dv.getUint32(base + ((flagsTrun & 0x100) ? 4 : 0) + ((flagsTrun & 0x200) ? 4 : 0));
        }
        duracao += (flagsTrun & 0x100) ? dv.getUint32(base) : duracaoPadrao;
    }
    if (flagsPrimeira === null) flagsPrimeira = flagsPadrao;
    // Sem informação de flags, considera não-chave (o escolhido só vale se for comprovadamente chave).
    const chave = flagsPrimeira !== null && !(flagsPrimeira & BIT_NAO_SINCRONIZADO);
    return { id, tfdt: { pos: tfdt.dados, versao: versaoTfdt, valor }, chave, duracao };
}

// Fragmentos completos (moof + mdat) de `bytes`: { pos, fim, trafs }.
export function listarFragmentosMp4(bytes) {
    const dv = visualizar(bytes);
    const caixas = lerCaixas(bytes, dv, 0, bytes.length);
    const fragmentos = [];
    for (let i = 0; i < caixas.length - 1; i++) {
        const moof = caixas[i];
        const mdat = caixas[i + 1];
        if (moof.tipo !== 'moof' || mdat.tipo !== 'mdat' || !moof.completa || !mdat.completa) continue;
        const trafs = lerCaixas(bytes, dv, moof.dados, moof.pos + moof.tam)
            .filter(c => c.tipo === 'traf')
            .map(t => { try { return lerTraf(bytes, dv, t); } catch (e) { return null; } }) // caixa corrompida: ignora só este trecho
            .filter(Boolean);
        if (trafs.length) fragmentos.push({ pos: moof.pos, fim: mdat.pos + mdat.tam, trafs });
    }
    return fragmentos;
}

function escreverTfdt(bytes, dv, tfdt, novoValor) {
    if (tfdt.versao === 1) dv.setBigUint64(tfdt.pos + 4, BigInt(Math.max(0, Math.round(novoValor))));
    else dv.setUint32(tfdt.pos + 4, Math.min(0xFFFFFFFF, Math.max(0, Math.round(novoValor))));
}

// Monta o clipe com (pelo menos) os últimos `segundos`, começando no fragmento (quadro-chave) mais
// próximo. Retorna { blob, segundosReais, semCabecalho: false } ou null.
export async function montarClipeMp4(chunks, cabecalho, segundos, agora, margemMs, tipo = 'video/mp4') {
    if (!chunks.length || !cabecalho) return null;
    const primeiro = Math.max(0, chunks.findIndex(c => c.t >= agora - segundos * 1000 - margemMs));
    const bytes = await juntarBlobs(chunks.slice(primeiro).map(c => c.blob));
    const fragmentos = listarFragmentosMp4(bytes);
    if (!fragmentos.length) return null;

    const trilhaVideo = cabecalho.trilhas.find(t => t.tipo === 'vide') || cabecalho.trilhas[0];
    const infos = fragmentos.map(f => {
        const traf = f.trafs.find(t => t.id === trilhaVideo.id) || f.trafs[0];
        // Só de áudio: todo fragmento pode iniciar o clipe (quadros de áudio são sempre independentes).
        return { f, inicio: traf.tfdt.valor / trilhaVideo.escala, duracao: traf.duracao / trilhaVideo.escala, chave: traf.chave || trilhaVideo.tipo !== 'vide' };
    });
    const ultimo = infos[infos.length - 1];
    const fim = ultimo.inicio + (ultimo.duracao || 1);
    const desde = fim - segundos;
    const escolhido = infos.filter(i => i.chave && i.inicio <= desde).pop() || infos.find(i => i.chave && i.inicio > desde);
    if (!escolhido) return null;

    // Recomeça os relógios de cada trilha no mesmo instante (em segundos) do fragmento escolhido.
    const dv = visualizar(bytes);
    const baseSeg = escolhido.inicio;
    const escolhidos = infos.slice(infos.indexOf(escolhido));
    escolhidos.forEach(({ f }) => {
        f.trafs.forEach(traf => {
            const trilha = cabecalho.trilhas.find(t => t.id === traf.id);
            if (!trilha) return;
            escreverTfdt(bytes, dv, traf.tfdt, traf.tfdt.valor - baseSeg * trilha.escala);
        });
    });

    const partes = [cabecalho.blob];
    escolhidos.forEach(({ f }) => partes.push(bytes.subarray(f.pos, f.fim)));
    return {
        blob: new Blob(partes, { type: tipo }),
        segundosReais: Math.max(1, Math.round(fim - baseSeg)),
        semCabecalho: false,
    };
}
