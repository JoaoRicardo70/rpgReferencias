// ==========================================
// 🔮 CÍRCULO DE INVOCAÇÃO (IA) — lógica pura. O jogador cola o texto original de uma Habilidade/Forma/Poder (do Google Docs),
// copia o prompt gerado, leva a uma IA e cola de volta o JSON. Aqui: monta o prompt, lê a resposta da IA (que costuma vir
// com ```json e texto em volta) e monta o poder COMPLETO no formato atual da ficha (mesmos campos de salvarNovoPoder).
// ==========================================
import { normalizarTipoAcao } from './acoesTecnica';

export const ROTULO_CATEGORIA = { habilidade: 'Habilidades', forma: 'Formas', poder: 'Poderes' };

export function montarPromptImportacao(texto, categoria = 'habilidade') {
    const rotulo = ROTULO_CATEGORIA[categoria] || ROTULO_CATEGORIA.habilidade;
    return `Atue como extrator de dados de RPG.
Transforme TODAS as ${rotulo.toLowerCase()} descritas no texto abaixo em itens do array "poderes".
Mesmo que usem fogo, gelo ou magia, COLOQUE em "poderes": o usuário quer registrá-las nesta aba.
Regras:
- "descricao": copie o texto original da habilidade (sem resumir).
- Dano como "15d6" vira danoQtd: 15 e danoFaces: 6. Sem dano: 0 e 0.
- "custoPercentual": custo em % das energias, se o texto disser (senão 0).
- "alcance" e "area": em quadrados, se o texto disser (senão 0).
- "tipoAcao": "acao", "bonus", "reacao", "movimento", "livre" ou "" se não estiver claro.
- Efeitos complexos (paralisia, condições, bônus, regras especiais): escreva em "notasIA".

TEXTO:
${String(texto || '').trim()}

RETORNE SOMENTE UM JSON PURO, sem explicações:
{
  "poderes": [{ "nome": "X", "descricao": "Y", "danoQtd": 0, "danoFaces": 0, "custoPercentual": 0, "alcance": 0, "area": 0, "tipoAcao": "", "notasIA": "" }]
}`;
}

// Acha o primeiro JSON (objeto ou lista) numa resposta de IA: tira cercas ```json e texto em volta, ignorando chaves dentro de strings.
export function extrairJson(texto, aPartirDe = 0) {
    const s = String(texto || '').replace(/```(?:json|JSON)?/g, ' ');
    const inicio = s.slice(aPartirDe).search(/[{[]/) + aPartirDe;
    if (inicio < aPartirDe) return null;
    const abre = s[inicio];
    const fecha = abre === '{' ? '}' : ']';
    let nivel = 0, emTexto = false, escape = false;
    for (let i = inicio; i < s.length; i++) {
        const c = s[i];
        if (emTexto) {
            if (escape) escape = false;
            else if (c === '\\') escape = true;
            else if (c === '"') emTexto = false;
            continue;
        }
        if (c === '"') emTexto = true;
        else if (c === abre) nivel++;
        else if (c === fecha && --nivel === 0) return s.slice(inicio, i + 1);
    }
    return null;
}

// Lê a resposta da IA. Devolve { ok: true, itens: [objetos] } ou { ok: false, erro }.
export function lerRespostaDaIA(texto) {
    const limpo = String(texto || '').replace(/```(?:json|JSON)?/g, ' ');
    let bruto = extrairJson(texto);
    if (!bruto) return { ok: false, erro: 'Não achei um JSON na resposta. Cole a resposta completa da IA.' };
    let dados;
    // Texto solto antes do JSON (ex.: "veja [1]"): tenta o próximo { ou [ até um parsear.
    for (let pos = limpo.indexOf(bruto); bruto; pos += 1) {
        try { dados = JSON.parse(bruto); break; } catch (e) { bruto = extrairJson(limpo, pos + 1); pos = bruto ? limpo.indexOf(bruto, pos) - 1 : pos; }
    }
    if (dados === undefined) return { ok: false, erro: 'O JSON está incompleto ou com erro. Peça à IA para devolver de novo, só o JSON.' };
    const lista = Array.isArray(dados) ? dados : (dados && (dados.poderes || dados.habilidades || dados.formas));
    if (!Array.isArray(lista)) return { ok: false, erro: 'O JSON não tem a lista "poderes".' };
    const itens = lista.filter(p => p && typeof p === 'object' && !Array.isArray(p));
    if (itens.length === 0) return { ok: false, erro: 'A lista "poderes" veio vazia.' };
    return { ok: true, itens };
}

const num = (v, padrao = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const inteiro = (v) => Math.max(0, Math.floor(num(v)));

// Poder completo, no mesmo formato de PoderesFormContext.salvarNovoPoder (para nada quebrar ao listar/usar).
export function montarPoderImportado(p, categoria, id) {
    const qtd = inteiro(p.danoQtd ?? p.dadosQtd);
    const faces = inteiro(p.danoFaces ?? p.dadosFaces);
    const poder = {
        id,
        nome: String(p.nome || '').trim() || 'Sem nome',
        descricao: String(p.descricao || ''),
        vertente: '',
        elemento: '',
        elementosAfetados: '',
        categoria,
        ativa: false,
        efeitos: [],
        efeitosPassivos: [],
        imagemUrl: '',
        dadosQtd: qtd,
        dadosFaces: faces || 20,
        custoPercentual: num(p.custoPercentual),
        custoPercentualMax: 0,
        semComoPoder: false,
        tipoAcao: normalizarTipoAcao(p.tipoAcao),
        alcance: num(p.alcance, 1) || 1,
        area: num(p.area),
        armaVinculada: '',
        pasta: '',
        notasIA: String(p.notasIA || '')
    };
    if (categoria === 'forma') { poder.maestria = 0; poder.fadigaPorUso = 0; }
    else if (categoria === 'habilidade' || categoria === 'poder') { poder.maestria = 0; poder.maestriaRequerida = 0; }
    return poder;
}
