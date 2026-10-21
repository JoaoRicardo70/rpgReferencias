// ==========================================
// 🔍 IDENTIFICAÇÃO DO ATAQUE RECEBIDO
// Algumas técnicas (Habilidades/Poderes/Formas) permitem PERCEBER, durante o combate, características do ataque
// que vem na sua direção. Como as Reações, isso é um EFEITO da técnica:
//   identificar_tipo_ataque -> descobre se o ataque é Físico, Energético ou de qual Elemento;
//   identificar_energia     -> descobre que Energia (Mana, Aura, Chakra...) está sendo gasta nele.
// Efeito PASSIVO vale sempre; efeito ATIVO só com a técnica LIGADA (mesma regra das Reações).
// ==========================================

export const ATRIBUTO_IDENTIFICAR_TIPO = 'identificar_tipo_ataque';
export const ATRIBUTO_IDENTIFICAR_ENERGIA = 'identificar_energia';

const ROTULOS_ENERGIA = {
    mana: 'Mana', aura: 'Aura', chakra: 'Chakra', corpo: 'Corpo',
    pontosVitais: 'Pontos Vitais', pontosMortais: 'Pontos Mortais', livre: 'Livre', flexivel: 'Flexível'
};

function semAcento(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }

export function rotuloEnergia(chave) {
    return ROTULOS_ENERGIA[chave] || String(chave || '');
}

function nomeElemento(elemento) {
    const e = String(elemento || '').trim();
    return e ? e.charAt(0).toUpperCase() + e.slice(1) : '';
}

// Energias realmente gastas no golpe (sem repetir), a partir dos drenos e dos custos que viram Poder.
export function energiasDoGolpe(drenos, custosPoder) {
    const chaves = [];
    (Array.isArray(drenos) ? drenos : []).forEach(d => { if (d && d.key && Number(d.valor) > 0) chaves.push(d.key); });
    (Array.isArray(custosPoder) ? custosPoder : []).forEach(c => { if (c && c.energia && Number(c.bruto) > 0) chaves.push(c.energia); });
    return [...new Set(chaves)];
}

// Classifica o ataque: Elemental (com o elemento) > Energético (gastou energia) > Físico.
export function classificarAtaque({ elemento, energias } = {}) {
    const e = semAcento(elemento);
    if (e && e !== 'fisico' && e !== 'neutro' && e !== 'nenhum') {
        const nome = nomeElemento(elemento);
        return { categoria: 'elemental', elemento: nome, rotulo: `Elemental (${nome})` };
    }
    if (Array.isArray(energias) && energias.length > 0) return { categoria: 'energetico', elemento: '', rotulo: 'Energético' };
    return { categoria: 'fisico', elemento: '', rotulo: 'Físico' };
}

// O que a ficha consegue identificar: { tipo, energia } (true/false), lendo efeitos passivos sempre e ativos só com a técnica ligada.
export function getIdentificacoes(ficha) {
    const r = { tipo: false, energia: false };
    const tecnicas = [
        ...(Array.isArray(ficha?.poderes) ? ficha.poderes : []),
        ...(Array.isArray(ficha?.habilidades) ? ficha.habilidades : [])
    ];
    tecnicas.forEach(t => {
        if (!t) return;
        const efeitos = [
            ...(Array.isArray(t.efeitosPassivos) ? t.efeitosPassivos : []),
            ...(Array.isArray(t.efeitos) && t.ativa === true ? t.efeitos : [])
        ];
        efeitos.forEach(e => {
            if (!e) return;
            if (e.atributo === ATRIBUTO_IDENTIFICAR_TIPO) r.tipo = true;
            if (e.atributo === ATRIBUTO_IDENTIFICAR_ENERGIA) r.energia = true;
        });
    });
    return r;
}

// Texto que o defensor vê, ou null se nada pôde ser identificado.
export function montarTextoIdentificacao(atacante, tipoAtaque, energias, identificacoes) {
    if (!identificacoes || (!identificacoes.tipo && !identificacoes.energia)) return null;
    const partes = [];
    if (identificacoes.tipo && tipoAtaque) partes.push(`ataque ${tipoAtaque}`);
    if (identificacoes.energia) {
        const lista = Array.isArray(energias) ? energias.map(rotuloEnergia) : [];
        partes.push(lista.length > 0 ? `Energia: ${lista.join(' + ')}` : 'sem Energia');
    }
    if (partes.length === 0) return null;
    return `🔍 ${atacante || 'Atacante'}: ${partes.join(' · ')}`;
}
