// Lógica pura do "clipe" (replay dos últimos instantes) sobre a saída do MediaRecorder em webm.
//
// O MediaRecorder entrega um único arquivo webm em pedaços (chunks): só o começo tem o cabeçalho
// (EBML + Segment/Info/Tracks). Para salvar "os últimos N segundos" sem gravar de novo, guardamos o
// cabeçalho e os chunks recentes e montamos: cabeçalho + a partir de um Cluster que contenha um
// QUADRO-CHAVE de vídeo (os clusters são cortados por tempo, não por quadro-chave: começar num
// cluster qualquer deixaria o player parado até o próximo quadro-chave) até o fim, com os
// timecodes reescritos para começar em 0.

export const RETENCAO_MAXIMA_MS = 10 * 60 * 1000 + 30 * 1000;
// Margem olhada antes do ponto pedido para achar um quadro-chave (o clipe pode sair um pouco maior).
export const MARGEM_QUADRO_CHAVE_MS = 20 * 1000;
export const OPCOES_DURACAO_CLIPE = [
    { segundos: 30, rotulo: '30 segundos' },
    { segundos: 60, rotulo: '1 minuto' },
    { segundos: 120, rotulo: '2 minutos' },
    { segundos: 300, rotulo: '5 minutos' },
    { segundos: 600, rotulo: '10 minutos' },
];

const ID_CLUSTER = 0x1F43B675;
const ID_SEGMENT = 0x18538067;
const ID_TRACKS = 0x1654AE6B;
const ID_TRACK_ENTRY = 0xAE;
const ID_TRACK_NUMBER = 0xD7;
const ID_TRACK_TYPE = 0x83;
const ID_TIMECODE = 0xE7;
const ID_SIMPLE_BLOCK = 0xA3;
const ID_BLOCK_GROUP = 0xA0;
const ID_BLOCK = 0xA1;
const ID_REFERENCE_BLOCK = 0xFB;

// Lê um inteiro de tamanho variável (EBML). Com `manterMarcador` devolve o ID cru (ex.: 0x1F43B675).
function lerVint(b, p, manterMarcador) {
    const primeiro = b[p];
    if (!primeiro) return null;
    let len = 1;
    let mascara = 0x80;
    while (!(primeiro & mascara)) { len++; mascara >>= 1; }
    if (len > 8 || p + len > b.length) return null;
    let valor = manterMarcador ? primeiro : (primeiro & (mascara - 1));
    let todosUns = (primeiro & (mascara - 1)) === (mascara - 1);
    for (let i = 1; i < len; i++) {
        valor = valor * 256 + b[p + i];
        if (b[p + i] !== 0xFF) todosUns = false;
    }
    return { len, valor, desconhecido: !manterMarcador && todosUns };
}

function lerElemento(b, p) {
    const id = lerVint(b, p, true);
    if (!id) return null;
    const tam = lerVint(b, p + id.len, false);
    if (!tam) return null;
    const ini = p + id.len + tam.len;
    return { id: id.valor, ini, fim: tam.desconhecido ? b.length : Math.min(b.length, ini + tam.valor) };
}

function lerUint(b, ini, fim) {
    let v = 0;
    for (let i = ini; i < fim; i++) v = v * 256 + b[i];
    return v;
}

// Procura o início de um Cluster válido (ID + tamanho EBML + Timecode E7), o que descarta
// coincidências dentro de dados de vídeo/áudio. Retorna o deslocamento ou -1.
export function acharInicioDeCluster(bytes, desde = 0) {
    for (let i = Math.max(0, desde); i <= bytes.length - 6; i++) {
        if (bytes[i] !== 0x1F || bytes[i + 1] !== 0x43 || bytes[i + 2] !== 0xB6 || bytes[i + 3] !== 0x75) continue;
        const tam = lerVint(bytes, i + 4, false);
        if (!tam) continue;
        const posTimecode = i + 4 + tam.len;
        if (posTimecode < bytes.length && bytes[posTimecode] === ID_TIMECODE) return i;
    }
    return -1;
}

// Timecode (ms) do cluster que começa em `pos`, e onde o valor está escrito. Null se ilegível.
function lerTimecodeDoCluster(b, pos) {
    const tam = lerVint(b, pos + 4, false);
    if (!tam) return null;
    const pTimecode = pos + 4 + tam.len;
    const t = lerVint(b, pTimecode + 1, false);
    if (!t || b[pTimecode] !== ID_TIMECODE || t.len !== 1 || t.valor < 1 || t.valor > 6) return null;
    const ini = pTimecode + 2;
    if (ini + t.valor > b.length) return null;
    return { valor: lerUint(b, ini, ini + t.valor), ini, tamanho: t.valor };
}

// Número da trilha de vídeo lido do cabeçalho (Segment > Tracks > TrackEntry). Null se for só áudio.
export function acharTrilhaDeVideo(cabecalhoBytes) {
    let resultado = null;
    const varrer = (ini, fim, entrada) => {
        let p = ini;
        while (p < fim) {
            const e = lerElemento(cabecalhoBytes, p);
            if (!e || e.fim <= p) return;
            if (e.id === ID_TRACK_ENTRY) {
                const t = { numero: null, tipo: null };
                varrer(e.ini, e.fim, t);
                if (t.tipo === 1 && resultado === null) resultado = t.numero;
            } else if (e.id === ID_SEGMENT || e.id === ID_TRACKS) {
                varrer(e.ini, e.fim, entrada);
            } else if (entrada && e.id === ID_TRACK_NUMBER) {
                entrada.numero = lerUint(cabecalhoBytes, e.ini, e.fim);
            } else if (entrada && e.id === ID_TRACK_TYPE) {
                entrada.tipo = lerUint(cabecalhoBytes, e.ini, e.fim);
            }
            p = e.fim;
        }
    };
    varrer(0, cabecalhoBytes.length, null);
    return resultado;
}

// O Chromium grava vídeo (com canal alfa) em BlockGroup: Block + BlockAdditions e, nos quadros
// que dependem de outro, um ReferenceBlock. Sem ReferenceBlock = quadro-chave.
function blocoDoGrupoEhChave(b, grupo, trilhaVideo) {
    let temBloco = false;
    let temReferencia = false;
    let p = grupo.ini;
    while (p < grupo.fim) {
        const el = lerElemento(b, p);
        if (!el || el.fim <= p) break;
        if (el.id === ID_BLOCK) {
            const trilha = lerVint(b, el.ini, false);
            temBloco = !!trilha && (trilhaVideo === null || trilha.valor === trilhaVideo);
        } else if (el.id === ID_REFERENCE_BLOCK) {
            temReferencia = true;
        }
        p = el.fim;
    }
    return temBloco && !temReferencia;
}

// O cluster em `pos` tem um SimpleBlock marcado como quadro-chave na trilha de vídeo?
// Sem trilha de vídeo (só áudio), qualquer bloco de áudio (sempre "chave") serve.
export function clusterTemQuadroChave(b, pos, trilhaVideo) {
    const c = lerElemento(b, pos);
    if (!c) return false;
    let p = c.ini;
    while (p < c.fim) {
        const el = lerElemento(b, p);
        if (!el || el.fim <= p || el.id === ID_CLUSTER) break;
        if (el.id === ID_SIMPLE_BLOCK) {
            const trilha = lerVint(b, el.ini, false);
            if (trilha) {
                const flags = b[el.ini + trilha.len + 2];
                if ((trilhaVideo === null || trilha.valor === trilhaVideo) && (flags & 0x80)) return true;
            }
        } else if (el.id === ID_BLOCK_GROUP && blocoDoGrupoEhChave(b, el, trilhaVideo)) {
            return true;
        }
        p = el.fim;
    }
    return false;
}

// Lista os clusters de `bytes`: { pos, tc (ms), chave }.
export function listarClusters(bytes, trilhaVideo) {
    const lista = [];
    let pos = 0;
    while (true) {
        const c = acharInicioDeCluster(bytes, pos);
        if (c < 0) break;
        const tc = lerTimecodeDoCluster(bytes, c);
        if (tc) lista.push({ pos: c, tc: tc.valor, chave: clusterTemQuadroChave(bytes, c, trilhaVideo) });
        pos = c + 5;
    }
    return lista;
}

// Reescreve o Timecode de cada Cluster subtraindo `base`, para o clipe começar em 0s. O tamanho do
// campo é mantido (só o valor muda), então nada mais no arquivo precisa ser ajustado. Muta `bytes`.
export function reescalarClusters(bytes, base) {
    let pos = 0;
    while (true) {
        const c = acharInicioDeCluster(bytes, pos);
        if (c < 0) break;
        const tc = lerTimecodeDoCluster(bytes, c);
        if (tc) {
            let novo = Math.max(0, tc.valor - base);
            for (let i = tc.tamanho - 1; i >= 0; i--) { bytes[tc.ini + i] = novo % 256; novo = Math.floor(novo / 256); }
        }
        pos = c + 5;
    }
    return bytes;
}

async function lerBytes(blob) {
    return new Uint8Array(await blob.arrayBuffer());
}

async function juntarBlobs(blobs) {
    const partes = await Promise.all(blobs.map(lerBytes));
    const total = partes.reduce((s, p) => s + p.length, 0);
    const r = new Uint8Array(total);
    let o = 0;
    partes.forEach(p => { r.set(p, o); o += p.length; });
    return r;
}

// Extrai o cabeçalho (tudo antes do primeiro Cluster) olhando até 3 chunks iniciais.
// Retorna { blob, trilhaVideo } ou null se não achar (formato inesperado).
export async function extrairCabecalhoWebm(chunksIniciais) {
    const bytes = await juntarBlobs(chunksIniciais.slice(0, 3));
    const inicio = acharInicioDeCluster(bytes);
    if (inicio <= 0) return null;
    const cabecalho = bytes.slice(0, inicio);
    return { blob: new Blob([cabecalho]), trilhaVideo: acharTrilhaDeVideo(cabecalho) };
}

// Descarta o que passou da janela de retenção. Retorna a nova lista (não muta a original).
export function podarChunks(chunks, agora, retencaoMs = RETENCAO_MAXIMA_MS) {
    const limite = agora - retencaoMs;
    return chunks.filter(c => c.t >= limite);
}

// Monta o Blob do clipe com (pelo menos) os últimos `segundos`, começando no quadro-chave mais
// próximo. Retorna { blob, segundosReais } ou null se não houver ponto de corte válido.
// `chunks`: [{ blob, t }] em ordem; `cabecalho`: resultado de extrairCabecalhoWebm.
export async function montarClipe(chunks, cabecalho, segundos, agora, tipo = 'video/webm') {
    if (!chunks.length) return null;
    const desde = agora - segundos * 1000;

    // Sem cabeçalho conhecido não dá para garantir um arquivo tocável: devolve o trecho cru.
    if (!cabecalho) {
        const i = Math.max(0, chunks.findIndex(c => c.t >= desde));
        return { blob: new Blob(chunks.slice(i).map(c => c.blob), { type: tipo }), segundosReais: segundos, semCabecalho: true };
    }

    const primeiro = Math.max(0, chunks.findIndex(c => c.t >= desde - MARGEM_QUADRO_CHAVE_MS));
    const bytes = await juntarBlobs(chunks.slice(primeiro).map(c => c.blob));
    const clusters = listarClusters(bytes, cabecalho.trilhaVideo);
    if (!clusters.length) return null;

    // O último cluster ainda está sendo escrito: ~1s de imagem além do seu timecode.
    const tcFim = clusters[clusters.length - 1].tc + 1000;
    const tcDesde = tcFim - segundos * 1000;
    const antes = clusters.filter(c => c.chave && c.tc <= tcDesde).pop();
    const escolhido = antes || clusters.find(c => c.chave && c.tc > tcDesde);
    if (!escolhido) return null;

    // Sem cópia extra: o buffer já é nosso, então reescreve os timecodes no próprio lugar.
    const cauda = reescalarClusters(bytes.subarray(escolhido.pos), escolhido.tc);
    return {
        blob: new Blob([cabecalho.blob, cauda], { type: tipo }),
        segundosReais: Math.max(1, Math.round((tcFim - escolhido.tc) / 1000)),
        semCabecalho: false,
    };
}

export function nomeArquivoClipe(meuNome, segundos, agora = new Date()) {
    const carimbo = agora.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const nome = (meuNome || 'Anonimo').replace(/[^a-zA-Z0-9_-]+/g, '_');
    return `clipe_${nome}_${segundos}s_${carimbo}.webm`;
}
