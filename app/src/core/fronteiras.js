// ==========================================
// ⚔️ FRONTEIRAS DO MAPA DA TERRA 0 (components/mapa/CamadaFronteiras.jsx e EditorFronteiras.jsx)
// O Mestre pinta no mapa quem controla cada pedaço de terra (disputas de território). O mapa é uma grade de
// GRADE_L x GRADE_A células; cada célula guarda o id (1-9 ou a-c) da facção que a controla, ou 0 se ninguém.
// No Firebase (cenario.fronteiras): { personalizado: true, facoes: { '1': { nome, cor } }, linhas: { l12: '0001100...' } }
// Enquanto o Mestre não mexe, vale o desenho padrão (fronteirasPadrao.js); o "personalizado" marca que ele já editou.
// — uma string por linha da grade, e linhas sem nenhuma célula pintada nem são guardadas (a mudança de uma pincelada
// só reescreve as linhas que ela tocou).
// ==========================================

export const GRADE_L = 320;
export const GRADE_A = 204;
export const MAX_FACCOES = 12;
export const NOME_MAX = 30;
export const RAIO_MIN = 1;
export const RAIO_MAX = 40;
export const RAIO_PADRAO = 8;
// Pincéis prontos (raio em células da grade; a grade tem 320 células de largura).
export const PINCEIS = [{ nome: 'P', raio: 2 }, { nome: 'M', raio: 5 }, { nome: 'G', raio: 10 }, { nome: 'GG', raio: 20 }, { nome: 'XG', raio: 36 }];
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;

// Cada facção tem um id de um caractere (1-9, a-c), na mesma ordem das cores abaixo.
const IDS = '123456789abc';
export const CORES_FACCOES = ['#4fc3f7', '#e0d6b8', '#e53935', '#fdd835', '#fb8c00', '#8e24aa', '#43a047', '#00acc1', '#d81b60', '#546e7a', '#9ccc65', '#8d6e63'];

const LINHA_VAZIA = '0'.repeat(GRADE_L);
const COR_VALIDA = /^#[0-9a-fA-F]{6}$/;
const ID_VALIDO = /^[1-9a-c]$/;
const corPadraoDe = (id) => CORES_FACCOES[IDS.indexOf(id)] || CORES_FACCOES[0];

export function gradeVazia() {
    return Array.from({ length: GRADE_A }, () => LINHA_VAZIA);
}

export function corValida(cor) {
    return typeof cor === 'string' && COR_VALIDA.test(cor);
}

export function nomeDeFaccaoValido(nome) {
    return typeof nome === 'string' ? nome.trim().slice(0, NOME_MAX) : '';
}

// Lista de facções a partir do que veio do Firebase (ignora ids/cores/nomes inválidos).
export function facoesDeFirebase(bruto) {
    if (!bruto || typeof bruto !== 'object') return [];
    return Object.keys(bruto)
        .filter((id) => ID_VALIDO.test(id) && bruto[id] && typeof bruto[id] === 'object')
        .sort()
        .map((id) => ({
            id,
            nome: nomeDeFaccaoValido(bruto[id].nome) || `Facção ${id}`,
            cor: corValida(bruto[id].cor) ? bruto[id].cor : corPadraoDe(id)
        }));
}

export function facoesParaFirebase(facoes) {
    const saida = {};
    (facoes || []).slice(0, MAX_FACCOES).forEach((f) => {
        if (!ID_VALIDO.test(f.id)) return;
        saida[f.id] = { nome: nomeDeFaccaoValido(f.nome) || `Facção ${f.id}`, cor: corValida(f.cor) ? f.cor : corPadraoDe(f.id) };
    });
    return saida;
}

// Linhas do Firebase -> grade completa. Células com id de facção que não existe mais viram 0.
export function gradeDeFirebase(linhas, facoes) {
    const ids = new Set((facoes || []).map((f) => f.id));
    const grade = gradeVazia();
    if (!linhas || typeof linhas !== 'object') return grade;
    for (let y = 0; y < GRADE_A; y++) {
        const bruta = linhas[`l${y}`];
        if (typeof bruta !== 'string') continue;
        let linha = '';
        for (let x = 0; x < GRADE_L; x++) {
            const c = bruta[x] || '0';
            linha += c !== '0' && ids.has(c) ? c : '0';
        }
        grade[y] = linha;
    }
    return grade;
}

export function gradeParaFirebase(grade) {
    const saida = {};
    (grade || []).forEach((linha, y) => { if (y < GRADE_A && linha !== LINHA_VAZIA) saida[`l${y}`] = linha; });
    return saida;
}

// Ponto da tela (em pixels dentro do mapa) -> célula da grade.
export function celulaDoPonto(x, y, largura, altura) {
    if (!(largura > 0) || !(altura > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return { cx: 0, cy: 0 };
    const cx = Math.min(GRADE_L - 1, Math.max(0, Math.floor((x / largura) * GRADE_L)));
    const cy = Math.min(GRADE_A - 1, Math.max(0, Math.floor((y / altura) * GRADE_A)));
    return { cx, cy };
}

// Pinta (id 1-9) ou apaga (id '0') um círculo de células. O raio é em células; as proporções da grade são as do mapa,
// então o círculo sai redondo na tela. Devolve uma grade nova (só copia as linhas tocadas); a original não muda.
export function pintarCirculo(grade, cx, cy, raio, id) {
    const alvo = id === '0' || ID_VALIDO.test(id) ? id : null;
    if (alvo === null) return grade;
    const r = Math.max(RAIO_MIN, Math.min(RAIO_MAX, Math.round(raio)));
    let nova = null;
    for (let y = Math.max(0, cy - r); y <= Math.min(GRADE_A - 1, cy + r); y++) {
        let linha = nova ? nova[y] : grade[y];
        let mudou = false;
        const partes = linha.split('');
        for (let x = Math.max(0, cx - r); x <= Math.min(GRADE_L - 1, cx + r); x++) {
            if ((x - cx) ** 2 + (y - cy) ** 2 > r * r + 0.5) continue;
            if (partes[x] !== alvo) { partes[x] = alvo; mudou = true; }
        }
        if (mudou) {
            if (!nova) nova = grade.slice();
            nova[y] = partes.join('');
        }
    }
    return nova || grade;
}

// Arrastar o pincel: pinta círculos ao longo da reta entre dois pontos para não deixar buracos.
export function pintarTraco(grade, de, ate, raio, id) {
    const passos = Math.max(1, Math.ceil(Math.hypot(ate.cx - de.cx, ate.cy - de.cy) / Math.max(1, raio / 2)));
    let atual = grade;
    for (let i = 0; i <= passos; i++) {
        const t = i / passos;
        atual = pintarCirculo(atual, Math.round(de.cx + (ate.cx - de.cx) * t), Math.round(de.cy + (ate.cy - de.cy) * t), raio, id);
    }
    return atual;
}

export function apagarFaccaoDaGrade(grade, id) {
    return grade.map((linha) => (linha.includes(id) ? linha.split(id).join('0') : linha));
}

export function contarCelulas(grade) {
    const total = {};
    grade.forEach((linha) => { for (const c of linha) if (c !== '0') total[c] = (total[c] || 0) + 1; });
    return total;
}

export function proximoIdLivre(facoes) {
    const usados = new Set((facoes || []).map((f) => f.id));
    for (const id of IDS) if (!usados.has(id)) return id;
    return null;
}

export function novaFaccao(facoes) {
    const id = proximoIdLivre(facoes);
    if (!id) return null;
    return { id, nome: `Facção ${id}`, cor: corPadraoDe(id) };
}

// Zoom do editor: { escala, x, y } — o mapa é ampliado a partir do canto superior esquerdo e deslocado por (x, y) pixels
// (x e y nunca positivos, para a borda do mapa não se afastar da borda da janela).
export const VISTA_INICIAL = { escala: 1, x: 0, y: 0 };

export function limitarVista(vista, largura, altura) {
    const escala = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(vista.escala) ? vista.escala : 1));
    const x = Math.min(0, Math.max(largura * (1 - escala), Number.isFinite(vista.x) ? vista.x : 0));
    const y = Math.min(0, Math.max(altura * (1 - escala), Number.isFinite(vista.y) ? vista.y : 0));
    return { escala, x, y };
}

// Muda o zoom mantendo o ponto (px, py) da janela parado debaixo do cursor.
export function zoomNoPonto(vista, novaEscala, px, py, largura, altura) {
    const escala = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, novaEscala));
    const mx = (px - vista.x) / vista.escala;
    const my = (py - vista.y) / vista.escala;
    return limitarVista({ escala, x: px - mx * escala, y: py - my * escala }, largura, altura);
}

export const CHAVE_TERRITORIOS_VISIVEIS = 'rpg_mapa_fronteiras_visivel';

// Cada pessoa escolhe se quer ver os territórios no mapa (padrão: ligado).
export function lerTerritoriosVisiveis(storage) {
    try { return storage?.getItem(CHAVE_TERRITORIOS_VISIVEIS) !== 'nao'; } catch (e) { return true; }
}

export function gravarTerritoriosVisiveis(storage, visivel) {
    try { storage?.setItem(CHAVE_TERRITORIOS_VISIVEIS, visivel ? 'sim' : 'nao'); } catch (e) { /* sem armazenamento: só vale nesta sessão */ }
}

export function gradeIgual(a, b) {
    if (a === b) return true;
    if (!a || !b || a.length !== b.length) return false;
    return a.every((linha, i) => linha === b[i]);
}
