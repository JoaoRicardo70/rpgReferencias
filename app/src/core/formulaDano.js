// ==========================================
// 🧮 FÓRMULA DE DANO — parser PURO do texto colado ("100d4+3*dex+3*PM", "25d10+3xstr+5xpresenca", "138d4+29d6+20d8+77d10").
// Devolve { dados: [{ qtd, faces }], fatores: { atributo: N }, fixo, ignorados: [texto...] }.
//   • Dados: cada "NdM" (mesmo tipo repetido soma a quantidade).
//   • Fatores: "N*attr" / "Nxattr" / "attr*N" (soma N x o valor EXIBIDO do atributo, só no dano); atributo sozinho = 1x.
//   • Fixo: número solto somado.
//   • Ignorados: o que não dá para ler com certeza ("att", termo desconhecido, subtração...). NUNCA chuta.
// O resultado de `fatores` só vale no cálculo do DANO (core/danoDados.js).
// ==========================================
import { ATRIBUTOS_DE_DANO, LIMITES_DANO_DADOS } from './danoDados.js';

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Apelidos (sem acento, minúsculos) -> chave do atributo da ficha.
// ⚠️ Suposição a confirmar: "pm / poder mágico" = Inteligência e "presença" = Carisma (mapeamento provável da ficha, ainda não confirmado).
export const APELIDOS_ATRIBUTO = {
    forca: 'forca', for: 'forca', str: 'forca', strength: 'forca',
    destreza: 'destreza', des: 'destreza', dex: 'destreza', dexterity: 'destreza',
    inteligencia: 'inteligencia', int: 'inteligencia', intel: 'inteligencia', intelligence: 'inteligencia',
    'poder magico': 'inteligencia', pm: 'inteligencia',
    sabedoria: 'sabedoria', sab: 'sabedoria', wis: 'sabedoria', wisdom: 'sabedoria',
    carisma: 'carisma', car: 'carisma', cha: 'carisma', charisma: 'carisma',
    presenca: 'carisma', pres: 'carisma',
    'energia espiritual': 'energiaEsp', 'energia esp': 'energiaEsp', energiaesp: 'energiaEsp', ee: 'energiaEsp',
    stamina: 'stamina', sta: 'stamina',
    constituicao: 'constituicao', con: 'constituicao', const: 'constituicao', constitution: 'constituicao',
};

// Chave do atributo para um nome escrito de qualquer jeito, ou null.
export function atributoDaFormula(nome) {
    const chave = semAcento(nome);
    if (!chave) return null;
    const direto = ATRIBUTOS_DE_DANO.find(a => semAcento(a) === chave);
    // hasOwn: "constructor", "__proto__" etc. nunca viram atributo.
    return direto || (Object.prototype.hasOwnProperty.call(APELIDOS_ATRIBUTO, chave) ? APELIDOS_ATRIBUTO[chave] : null);
}

const RE_DADO = /^(\d{1,6})\s*d\s*(\d{1,6})$/;
const RE_FATOR_NA_FRENTE = /^(\d+(?:[.,]\d+)?)\s*[*x×]\s*([a-z][a-z ]*)$/;
const RE_FATOR_ATRAS = /^([a-z][a-z ]*?)\s*[*x×]\s*(\d+(?:[.,]\d+)?)$/;
const RE_NUMERO = /^\d+(?:[.,]\d+)?$/;

// Soma o fator de um atributo repetido (600*dex+600*dex) sem passar de fatorMax; se cortou, avisa em `ignorados`.
function somarFator(saida, atributo, n) {
    const total = Math.round(((saida.fatores[atributo] || 0) + n) * 10000) / 10000;
    if (total > LIMITES_DANO_DADOS.fatorMax) {
        saida.fatores[atributo] = LIMITES_DANO_DADOS.fatorMax;
        saida.ignorados.push(`fator de ${atributo} limitado a ${LIMITES_DANO_DADOS.fatorMax}`);
    } else saida.fatores[atributo] = total;
}

export function interpretarFormulaDano(texto) {
    const saida = { dados: [], fatores: {}, fixo: 0, ignorados: [] };
    const bruto = String(texto ?? '').trim();
    if (!bruto) return saida;
    const porFaces = new Map();
    // Termos separados por "+"; "-" no meio não é aceito (vira ignorado junto do termo).
    bruto.split('+').forEach((termoBruto) => {
        const original = termoBruto.trim();
        if (!original) return;
        const t = semAcento(original).replace(/[()]/g, '').replace(/\s*[*×]\s*/g, '*').trim();

        const d = RE_DADO.exec(t);
        if (d) {
            const qtd = Number(d[1]); const faces = Number(d[2]);
            if (qtd < 1 || faces < 1 || qtd > LIMITES_DANO_DADOS.qtdMax || faces > LIMITES_DANO_DADOS.facesMax) { saida.ignorados.push(original); return; }
            porFaces.set(faces, (porFaces.get(faces) || 0) + qtd);
            return;
        }
        let fator = null;
        let m = RE_FATOR_NA_FRENTE.exec(t);
        if (m) fator = { n: m[1], nome: m[2] };
        else if ((m = RE_FATOR_ATRAS.exec(t))) fator = { n: m[2], nome: m[1] };
        if (fator) {
            const atributo = atributoDaFormula(fator.nome);
            const n = parseFloat(fator.n.replace(',', '.'));
            if (atributo && Number.isFinite(n) && n >= 1 && n <= LIMITES_DANO_DADOS.fatorMax) somarFator(saida, atributo, n);
            else saida.ignorados.push(original);
            return;
        }
        if (RE_NUMERO.test(t)) { saida.fixo += parseFloat(t.replace(',', '.')); return; }
        const sozinho = atributoDaFormula(t);
        if (sozinho) { somarFator(saida, sozinho, 1); return; }
        saida.ignorados.push(original);
    });
    porFaces.forEach((qtd, faces) => { saida.dados.push({ qtd: Math.min(qtd, LIMITES_DANO_DADOS.qtdMax), faces }); });
    return saida;
}

// { dex: 3, "poder magico": 2 } -> { destreza: 3, inteligencia: 2 }: troca os apelidos de atributo pelas chaves da ficha (chave desconhecida fica como veio, e
// normalizarStatusFatores a descarta). Usado ao ler o JSON de uma IA.
export function fatoresComApelidos(bruto) {
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return bruto;
    const saida = {};
    Object.keys(bruto).forEach((k) => { saida[atributoDaFormula(k) || k] = bruto[k]; });
    return saida;
}
