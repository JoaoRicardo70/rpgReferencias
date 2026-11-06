// ==========================================
// 🌪️ IMPORTADOR DE TÉCNICAS ELEMENTAIS (IA) — lógica pura. Mesmo caminho do importador de Habilidades (core/importadorIA.js):
// o jogador cola o texto das magias (Google Docs), copia a instrução, leva a uma IA e cola o JSON de volta. Aqui: monta a instrução
// com as listas REAIS do sistema (elementos, energias, mecânicas, estados), lê a resposta, valida cada técnica e prepara a PRÉVIA
// que o jogador revisa antes de gravar em ficha.ataquesElementais. Nada vem direto da IA para a ficha sem passar por aqui.
// ==========================================
import { ESTADOS } from './condicoes.js';
import { lerRespostaDaIA, juntarNotas } from './importadorIA.js';
import { normalizarAplicaEstados } from './estadosGolpe.js';
import { normalizarAoAcertar } from './aoAcertar.js';
import { normalizarUsos } from './usosPoder.js';
import { normalizarTipoAcao, TIPOS_ACAO_TECNICA } from './acoesTecnica.js';
import { dadosLimitadosDaTecnica } from './limiteDados.js';

export const MECANICAS_TECNICA = ['ataque', 'saving', 'infusao', 'suporte'];
export const ATRIBUTOS_SAVING = ['forca', 'destreza', 'constituicao', 'sabedoria', 'inteligencia', 'stamina', 'carisma', 'energiaEsp'];
export const ENERGIAS_TECNICA = ['flexivel', 'mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais', 'livre'];
export const FILTROS_ALVO = ['todos', 'inimigos', 'aliados'];

const LIMITE_DESCRICAO = 4000;
const LIMITE_DADOS = 1000;
const LIMITE_CUSTO = 1000;
const LIMITE_ALCANCE = 1000;
const LIMITE_DURACAO = 99;

const num = (v, padrao = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const chave = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const texto = (v, limite) => String(v ?? '').trim().substring(0, limite);
const lista = (v) => {
    const vistos = new Set();
    return (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s ?? '').trim()).filter((s) => {
        const k = s.toLowerCase();
        if (!s || vistos.has(k)) return false;
        vistos.add(k);
        return true;
    });
};

export function montarPromptTecnicas(textoOriginal, elementos = [], elementoPadrao = 'Neutro') {
    const conhecidos = (Array.isArray(elementos) ? elementos : []).filter(Boolean);
    return `Atue como extrator de dados de um sistema de RPG.
Transforme TODAS as magias, técnicas e feitiços do texto abaixo em itens do array "ataquesElementais", UM item por técnica (não junte, não resuma, não pule nenhuma).

CAMPOS DE CADA ITEM
- "nome" e "descricao" (copie o texto original da técnica, sem resumir).
- "elemento": ${conhecidos.length ? `use EXATAMENTE um destes nomes: ${conhecidos.join(', ')}` : 'o elemento da técnica'}. Se o texto não disser ou não houver equivalente, use "${elementoPadrao}".
- "danoQtd" e "danoFaces": "15d6" vira 15 e 6. Sem dano: 0 e 0.
- "custoPercentual": custo em % da energia, se o texto disser (senão 0). "custoPercentualMax": só se o texto der uma faixa (ex.: "10% a 30%" = 10 e 30), senão 0.
- "energiaCombustao": "mana", "aura", "chakra", "corpo", "pontosVitais", "pontosMortais", "livre" (sem custo) ou "flexivel" (se não estiver claro).
- "tipoMecanica": "ataque" (rola Acerto contra a CA), "saving" (o alvo faz teste de resistência), "infusao" (buff/infusão) ou "suporte" (cura/apoio). Na dúvida, "ataque".
- "savingAttr" (só se "saving"): ${ATRIBUTOS_SAVING.join(', ')}.
- "alcance" e "area": em quadrados (alcance padrão 1, área 0). "alvosAfetados" (só para área): ${FILTROS_ALVO.join(', ')}. "duracao": turnos que a zona/efeito dura (0 se instantâneo).
- "elementosAfetados": texto livre com o que a técnica afeta ou consome (ex.: "Fogo, Ilusões"), se o texto disser.
- "tipoAcao": ${TIPOS_ACAO_TECNICA.filter(t => t.id).map(t => `"${t.id}"`).join(', ')} ou "" se não estiver claro.
- "aplicaEstados": estados que a técnica causa em quem ela atinge: [{"id": "...", "stacks": 1}]. Ids válidos: ${ESTADOS.map(e => e.id).join(', ')}.
- "usosMax" e "usosPor": se o texto limita os usos ("1 vez por cena"), o número em "usosMax" e "cena" ou "descanso" em "usosPor". Sem limite, omita os dois.
- "aoAcertar": o que acontece com QUEM ACERTOU quando a técnica atinge e causa dano: [{"tipo":"curarAtacante" ou "energiaAtacante","modo":"fixo" | "percAtual" | "percMax","valor":N,"energia":"mana" | "aura" | "chakra" | "corpo"}]. No alvo: {"tipo":"drenarEnergiaAlvo","energia":"mana","modo":"fixo","valor":N} e {"tipo":"debuffAlvo","atributo":"evasiva" | "resistencia" | "acerto","valor":N,"duracao":turnos do alvo (1 a 20),"empilha":true se soma a cada golpe}. Só inclua se o texto disser isso claramente.
- "notasIA": regras que NÃO cabem nos campos acima (condições, gatilhos, requisitos), em frases curtas, uma por linha.
- "naoAplicado": lista de frases curtas com tudo o que o texto diz e que você NÃO conseguiu colocar em nenhum campo.

NÃO CONVERTA multiplicadores (xN no dano, "dobra", "triplica", bônus de Poder): coloque cada um em "naoAplicado". Técnicas não têm lista de efeitos de atributo (Força, Evasiva etc.): se o texto der um buff assim, escreva em "naoAplicado". NÃO invente campos nem valores.

TEXTO:
${String(textoOriginal || '').trim()}

RETORNE SOMENTE UM JSON PURO, sem explicações:
{
  "ataquesElementais": [{ "nome": "X", "descricao": "Y", "elemento": "${elementoPadrao}", "danoQtd": 0, "danoFaces": 0, "custoPercentual": 0, "energiaCombustao": "flexivel", "tipoMecanica": "ataque", "alcance": 1, "area": 0, "alvosAfetados": "todos", "duracao": 0, "tipoAcao": "", "aplicaEstados": [], "notasIA": "", "naoAplicado": [] }]
}`;
}

// Lê a resposta da IA (aceita "ataquesElementais" e variações; ver CHAVES_DE_LISTA em importadorIA.js).
export const lerRespostaTecnicas = lerRespostaDaIA;

// Valida UMA técnica vinda da IA. `elementos` = nomes que o Grimório conhece; `elementoPadrao` = o elemento da aba aberta.
// Devolve { objeto, avisos, naoAplicado, valido }; `objeto` já está no formato de ficha.ataquesElementais (sem id).
export function prepararTecnicaImportada(bruto, { elementos = [], elementoPadrao = 'Neutro' } = {}) {
    const p = bruto && typeof bruto === 'object' ? bruto : {};
    const avisos = [];
    const naoAplicado = lista(p.naoAplicado);
    const nome = texto(p.nome, 80);
    if (!nome) avisos.push('Sem nome: dê um nome na prévia para poder importar.');

    // Elemento: casa sem diferenciar maiúscula/acento com um que o Grimório conhece (senão a técnica iria para "Pergaminhos Perdidos").
    const conhecidos = Array.isArray(elementos) ? elementos : [];
    const pedido = texto(p.elemento, 60);
    let elemento = conhecidos.find(e => chave(e) === chave(pedido));
    if (!elemento) {
        elemento = elementoPadrao;
        if (pedido && chave(pedido) !== chave(elementoPadrao)) avisos.push(`Elemento "${pedido}" não existe no Grimório; usei "${elementoPadrao}". Troque na prévia se quiser.`);
    }

    // Dados: cortados no limite do elemento (core/limiteDados.js), como ao salvar à mão.
    const qtdBruta = Math.max(0, Math.min(LIMITE_DADOS, Math.floor(num(p.danoQtd ?? p.dadosQtd))));
    const facesBrutas = Math.max(0, Math.min(LIMITE_DADOS, Math.floor(num(p.danoFaces ?? p.dadosFaces))));
    const dados = dadosLimitadosDaTecnica({ elemento }, qtdBruta, facesBrutas);
    if (dados.limitado) avisos.push(`Limite de dados do elemento: ${dados.limite} de dano (${dados.qtd}d${dados.faces}). A IA pediu ${qtdBruta}d${facesBrutas}.`);
    if (qtdBruta > 0 && facesBrutas === 0) avisos.push('A IA deu a quantidade de dados mas não as faces; ficou sem dano.');

    let energia = ENERGIAS_TECNICA.find(e => chave(e) === chave(p.energiaCombustao));
    if (!energia) {
        energia = 'flexivel';
        if (texto(p.energiaCombustao, 30)) avisos.push(`Energia "${texto(p.energiaCombustao, 30)}" inválida; usei Flexível.`);
    }
    if (String(elemento).includes('Truque') && energia !== 'livre') energia = 'livre'; // Truques só usam energia Livre

    const mecanica = MECANICAS_TECNICA.find(m => m === chave(p.tipoMecanica)) || 'ataque';
    const saving = ATRIBUTOS_SAVING.find(a => chave(a) === chave(p.savingAttr)) || 'destreza';
    if (mecanica === 'saving' && !ATRIBUTOS_SAVING.some(a => chave(a) === chave(p.savingAttr))) avisos.push('Teste de resistência sem atributo válido; usei Destreza.');
    const alvos = FILTROS_ALVO.find(a => a === chave(p.alvosAfetados)) || 'todos';

    const custo = Math.max(0, Math.min(LIMITE_CUSTO, num(p.custoPercentual ?? p.custoValor)));
    let custoMax = Math.max(0, Math.min(LIMITE_CUSTO, num(p.custoPercentualMax ?? p.custoValorMax)));
    if (custoMax > 0 && custoMax < custo) { avisos.push('Custo máximo menor que o custo; ignorei o máximo.'); custoMax = 0; }

    const objeto = {
        nome, descricao: texto(p.descricao, LIMITE_DESCRICAO), elemento,
        elementosAfetados: texto(p.elementosAfetados, 120),
        bonusTipo: 'nenhum', bonusValor: '',
        custoValor: custo, custoValorMax: custoMax, semComoPoder: false,
        tipoAcao: normalizarTipoAcao(p.tipoAcao),
        dadosExtraQtd: facesBrutas > 0 ? dados.qtd : 0, dadosExtraFaces: dados.faces || 20,
        energiaCombustao: energia, tipoMecanica: mecanica, savingAttr: saving,
        alcanceQuad: Math.max(0, Math.min(LIMITE_ALCANCE, num(p.alcance ?? p.alcanceQuad, 1))),
        areaQuad: Math.max(0, Math.min(LIMITE_ALCANCE, num(p.area ?? p.areaQuad))),
        alvosAfetados: alvos,
        duracaoZona: Math.max(0, Math.min(LIMITE_DURACAO, Math.floor(num(p.duracao ?? p.duracaoZona)))),
        equipado: false
    };

    if (Array.isArray(p.aplicaEstados) && p.aplicaEstados.length) {
        const estados = normalizarAplicaEstados(p.aplicaEstados);
        if (estados.length < p.aplicaEstados.length) avisos.push(`${p.aplicaEstados.length - estados.length} estado(s) inválido(s) ou acima do limite foram descartados.`);
        if (estados.length) objeto.aplicaEstados = estados;
    }
    if (Array.isArray(p.aoAcertar) && p.aoAcertar.length) {
        const ao = normalizarAoAcertar(p.aoAcertar);
        if (ao.length < p.aoAcertar.length) avisos.push(`${p.aoAcertar.length - ao.length} efeito(s) "Ao acertar" inválido(s) foram descartados.`);
        if (ao.length) objeto.aoAcertar = ao;
    }
    const usos = normalizarUsos(p.usosMax, p.usosPor);
    if (usos) { objeto.usosMax = usos.max; objeto.usosPor = usos.por; }

    // Técnicas não têm efeitos de atributo: se a IA mandou, nada se perde (vai para as notas).
    ['efeitos', 'efeitosPassivos'].forEach((campo) => {
        (Array.isArray(p[campo]) ? p[campo] : []).forEach((e) => {
            if (e && typeof e === 'object') naoAplicado.push(`Efeito de atributo não importado (técnicas não têm; use uma Habilidade): ${e.nome ? `${e.nome}: ` : ''}${e.atributo || '?'} ${e.propriedade || ''} ${e.valor ?? ''}`.trim());
        });
    });

    objeto.naoAplicado = naoAplicado;
    objeto.notasIA = juntarNotas(p.notasIA, naoAplicado);
    return { objeto, avisos, naoAplicado, valido: nome.length > 0 };
}

// Lista inteira para a prévia: [{ chave, marcado, objeto, avisos, naoAplicado, valido }].
export function prepararImportacaoTecnicas(itens, opcoes = {}, chaveInicial = 1) {
    return (Array.isArray(itens) ? itens : []).map((bruto, i) => {
        const r = prepararTecnicaImportada(bruto, opcoes);
        // `pedido` = os dados que a IA pediu (antes do corte), para recalcular o limite se o jogador trocar o elemento na prévia.
        const q = Math.max(0, Math.min(LIMITE_DADOS, Math.floor(num(bruto && (bruto.danoQtd ?? bruto.dadosQtd)))));
        const f = Math.max(0, Math.min(LIMITE_DADOS, Math.floor(num(bruto && (bruto.danoFaces ?? bruto.dadosFaces)))));
        return { chave: chaveInicial + i, marcado: r.valido, objeto: r.objeto, avisos: r.avisos, naoAplicado: r.naoAplicado, valido: r.valido, pedido: { qtd: q, faces: f } };
    });
}

// Troca o elemento de um item da prévia e REAPLICA o que depende dele: limite de dados e energia livre dos Truques.
// Devolve o item novo (não muda o original). Avisos de elemento/limite antigos saem; o de limite novo entra se couber.
export function trocarElementoDaPrevia(item, elemento) {
    if (!item || !item.objeto) return item;
    const pedido = item.pedido || { qtd: item.objeto.dadosExtraQtd || 0, faces: item.objeto.dadosExtraFaces || 0 };
    const dados = dadosLimitadosDaTecnica({ elemento }, pedido.qtd, pedido.faces);
    const objeto = { ...item.objeto, elemento, dadosExtraQtd: pedido.faces > 0 ? dados.qtd : 0, dadosExtraFaces: dados.faces || 20 };
    if (String(elemento).includes('Truque')) objeto.energiaCombustao = 'livre';
    const avisos = (item.avisos || []).filter(a => !/^Elemento ".*" não existe/.test(a) && !/^Limite de dados do elemento/.test(a));
    if (dados.limitado) avisos.push(`Limite de dados do elemento: ${dados.limite} de dano (${dados.qtd}d${dados.faces}). A IA pediu ${pedido.qtd}d${pedido.faces}.`);
    return { ...item, objeto, avisos };
}

// Resumo de uma linha para a prévia.
export function resumirTecnicaImportada(o) {
    if (!o) return '';
    const partes = [o.elemento];
    if (o.dadosExtraQtd > 0) partes.push(`${o.dadosExtraQtd}d${o.dadosExtraFaces}`);
    if (o.custoValor > 0) partes.push(`custo ${o.custoValor}${o.custoValorMax > 0 ? `–${o.custoValorMax}` : ''}% ${o.energiaCombustao}`);
    else partes.push(o.energiaCombustao);
    partes.push(o.tipoMecanica === 'saving' ? `resistência (${o.savingAttr})` : o.tipoMecanica);
    if (o.alcanceQuad > 0) partes.push(`alcance ${o.alcanceQuad}Q`);
    if (o.areaQuad > 0) partes.push(`área ${o.areaQuad}Q`);
    if (o.usosMax) partes.push(`${o.usosMax}×/${o.usosPor}`);
    return partes.join(' · ');
}

// Técnica pronta para ficha.ataquesElementais: cópia profunda (a prévia e a ficha nunca dividem objetos) + id.
export function montarTecnicaFinal(objeto, id) {
    const copia = JSON.parse(JSON.stringify(objeto || {}));
    delete copia.naoAplicado;
    return { ...copia, id };
}
