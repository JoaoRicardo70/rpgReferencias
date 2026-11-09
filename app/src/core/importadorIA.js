// ==========================================
// 🔮 CÍRCULO DE INVOCAÇÃO (IA) — lógica pura. O jogador cola o texto original de uma Habilidade/Forma/Poder (do Google Docs),
// copia o prompt gerado, leva a uma IA e cola de volta o JSON. Aqui: monta o prompt (com as listas REAIS de atributos,
// propriedades e estados do sistema), lê a resposta da IA (que costuma vir com ```json e texto em volta), valida cada item com
// o mesmo normalizarPoder da Sexta-Feira e prepara a PRÉVIA que o jogador revisa antes de gravar.
// ==========================================
import { ESTADOS } from './condicoes';
import { lerCustoPorTurno } from './custoPorTurno';
import { ATRIBUTOS_EFEITO, PROPRIEDADES_EFEITO, CATEGORIAS_PODER, normalizarPoder, resumirProposta } from './sextaFeiraCriacao';
import { ATRIBUTOS_COM_QUANDO, normalizarQuandoMultiplicador } from './efeitosCondicionais';
import { EVENTOS_GATILHO, ACOES_GATILHO, LIMITE_GATILHOS_POR_FONTE, LIMITE_ACOES_POR_GATILHO, LIMITE_LINHAS_TABELA } from './gatilhos';
import { lerGatilhosDaIA, marcarGatilhosPendentes, gatilhoFaltaResponder, decidirModoDoGatilho, finalizarGatilho } from './gatilhosImportacao';

export const ROTULO_CATEGORIA = { habilidade: 'Habilidades', forma: 'Formas', poder: 'Poderes' };

// Multiplicadores (xN no dano, xN em status, xN em Poder Direto...) das fichas antigas NÃO são importados por enquanto: foram
// pensados para outra escala (o multiplicador de dano virou aumento de Poder Calculado). Ficam nas notas, para o jogador decidir.
export const PROPRIEDADES_NAO_IMPORTADAS = ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'];

// 'dano' não tem efeito no Grimório (os multiplicadores de dano só entram no Poder Calculado e o editor já esconde esse atributo).
export const ATRIBUTOS_NAO_IMPORTADOS = ['dano'];

const LIMITE_NOTAS = 4000;

export function montarPromptImportacao(texto, categoria = 'habilidade') {
    const rotulo = ROTULO_CATEGORIA[categoria] || ROTULO_CATEGORIA.habilidade;
    const padrao = ROTULO_CATEGORIA[categoria] ? categoria : 'habilidade';
    return `Atue como extrator de dados de um sistema de RPG.
Transforme TODAS as ${rotulo.toLowerCase()} do texto abaixo em itens do array "poderes", UM item por habilidade (não junte, não resuma, não pule nenhuma).
Mesmo que usem fogo, gelo ou magia, COLOQUE em "poderes": o usuário quer registrá-las nesta aba.

CAMPOS DE CADA ITEM
- "nome" e "descricao" (copie o texto original da habilidade, sem resumir).
- "categoria": "habilidade", "forma" ou "poder" (se o texto não disser, use "${padrao}").
- "danoQtd" e "danoFaces": "15d6" vira 15 e 6. Sem dano: 0 e 0.
- "custoPercentual": custo em % das energias, se o texto disser (senão 0). "alcance" e "area": em quadrados (senão 0).
- "tipoAcao": "acao", "bonus", "reacao", "movimento", "livre" ou "" se não estiver claro.
- "efeitos": efeitos que valem enquanto a habilidade está LIGADA (ativa): o texto diz "ao usar", "ao ativar", "enquanto ativo".
- "efeitosPassivos": efeitos que valem SEMPRE, SOMENTE se o texto disser isso com todas as letras (seção "Passivas", "passivo", "sempre ativo", "permanente", "sem precisar ativar"). NUNCA coloque aqui um bônus só porque o texto o lista.
- "efeitosIncertos": bônus que o texto lista mas NÃO deixa claro se valem sempre ou só com a habilidade ligada (ex.: uma lista solta "Aumenta a rolagem de ataque em +10"). NA DÚVIDA, use este campo: o jogador decide depois. Mesmo formato dos outros efeitos.
- "subHabilidades": quando o texto tem uma habilidade PRINCIPAL (um título, ex.: "Rinnegan Supremo (Olho esquerdo):") e, abaixo dela, itens com nome próprio que são habilidades DELA (ex.: "- Limbo: ...", "- Izanagi: ..."), crie UM item só para a principal e ponha esses itens aqui, SEM criar itens separados para eles: [{"nome","descricao","tipoAcao","usosMax","usosPor","recargaTurnos","custoPorTurno","efeitos","efeitosPassivos","efeitosIncertos","multiplicadores","gatilhos","naoAplicado"}] (mesmas regras dos campos acima). Observações soltas da principal (ex.: "x800 em todo dano") ficam na principal, em "naoAplicado". Textos de prints seguidos sobre a mesma habilidade principal são UM item só. Sem sub-habilidades, use [].
  Cada efeito: {"nome": "...", "atributo": "...", "propriedade": "...", "valor": 0}. "valor" é SEMPRE um número puro.
- "aplicaEstados": estados que a habilidade causa em quem ela atinge: [{"id": "...", "stacks": 1}]. Ids válidos: ${ESTADOS.map(e => e.id).join(', ')}.
- "usosMax" e "usosPor": se o texto limita os usos ("1 vez por cena", "3 usos por descanso"), coloque o número em "usosMax" e "cena" ou "descanso" em "usosPor". Sem limite, omita os dois.
- "custoPorTurno": se o texto cobra energia A CADA TURNO enquanto a habilidade está ligada ("5% de chakra por turno", "12 de mana por turno", "5 de aura por turno"): {"modo":"fixo" (número) ou "percMax" (% do máximo da energia),"valor":N,"energia":"mana" | "aura" | "chakra" | "corpo"}. Sem custo por turno, omita.
- "danoVerdadeiro": true SÓ se o texto disser que o dano é verdadeiro, ignora resistências, imunidades ou reduções ("dano verdadeiro", "ignora resistências e imunidades"). Sem isso, omita.
- "escudoAoLigar": se o poder cria uma barreira, escudo ou vida temporária ao ser ligado ("cria um domo com 1600 de vida", "ganha 100 de vida temporária"): {"nome":"nome da barreira","valor":N (mesma escala do dano),"tipo":"escudo" (barreira que absorve dano) ou "vidaTemporaria"}. Só para escudo fixo e simples; condições (a cada 50 de vida perdida) vão para "naoAplicado".
- "recargaTurnos": se o texto manda esperar turnos para usar de novo ("1 vez a cada 2 turnos", "espere 3 turnos para usar de novo", "reutilizável após 3 turnos"), o número inteiro de turnos (1 a 99). Sem recarga, omita.
- "aoDesligar": se desligar a habilidade causa dano em quem a usava ("ao desativar, sofre 238d6 de dano"): {"dadosQtd":238,"dadosFaces":6,"texto":"opcional"}. Sem isso, omita.
- "aoAcertar": o que acontece com QUEM ACERTOU quando o golpe atinge e causa dano ("recupera 200 de energia por ataque", "cura X% da vida a cada ataque"): [{"tipo":"curarAtacante" ou "energiaAtacante","modo":"fixo" | "percAtual" | "percMax","valor":N,"energia":"mana" | "aura" | "chakra" | "corpo" (só em energiaAtacante e drenarEnergiaAlvo)}]. "fixo" = número na mesma escala do dano; "percMax" = % do máximo; "percAtual" = % do valor atual. No ALVO: {"tipo":"drenarEnergiaAlvo","energia":"mana","modo":"fixo","valor":N} ("corta 100 de energia do alvo") e {"tipo":"debuffAlvo","atributo":"evasiva" | "resistencia" | "acerto","valor":N,"duracao":turnos do alvo (1 a 20),"empilha":true se soma a cada golpe} ("reduz em 3 a CA do inimigo a cada ataque" = valor 3, atributo evasiva, empilha true; use também resistencia se o texto falar da CA em geral). Cura do alvo reduzida: {"tipo":"reduzirCuraAlvo","fator":0.01 a 1 (0.5 = a cura do alvo fica pela metade, 1/3 = 0.33),"duracao":turnos do alvo (1 a 20)} ("deixa a cura do alvo em 1/2 por 1 turno" = fator 0.5, duracao 1). Outros debuffs vão para "naoAplicado".
- "gatilhos": regras REATIVAS do texto no formato "quando X acontecer, faça Y" (ex.: "se um golpe me levaria a 0, fico com 1 de vida", "ao acertar, ganho 1 carga", "no início do meu turno, curo 5%"). Lista de até ${LIMITE_GATILHOS_POR_FONTE} por habilidade (e por sub-habilidade). Cada gatilho: {"nome":"...","evento":{"tipo":"..."},"condicoes":[],"limite":{"max":1,"por":"cena"},"acoes":[{"tipo":"..."}]}. Use SÓ o vocabulário abaixo; o que não couber vai para "naoAplicado". NÃO escreva "modo", "armado" nem "perguntar": o jogador decide se é automático ou opcional depois. Regra simples de cura/energia ao acertar fica em "aoAcertar", não em gatilhos.
  EVENTO (campo "evento.tipo"): ${EVENTOS_GATILHO.map(e => `${e.id} (${e.rotulo.replace(/^(Quando|No) /, '')})`).join('; ')}.
    Parâmetros do evento: vidaAbaixoDe {"de":%maior,"ate":%menor} (% da Vida máxima, ex.: de 50 e ate 26 = entre 50% e 26%); acertou e atingido aceitam "nivel": "normal", "critico", "fatal" ou "qualquer"; poderLigou e poderDesligou aceitam "poderId" (vazio = a própria habilidade; "qualquer" = qualquer Poder); contadorAtingiu {"contadorId":"nome do contador","op":">=" ou "==","valor":N}.
  AÇÃO (campo "tipo" de cada item de "acoes", até ${LIMITE_ACOES_POR_GATILHO} por gatilho): ${ACOES_GATILHO.map(a => a.id).join(', ')}.
    Parâmetros: anularDano {} (SÓ no evento danoQueZeraria); definirVida {"valor":N} ou {"percMax":%}; curar {"modo":"fixo"|"percMax"|"percAtual","valor":N}; escudo {"nome","valor":N,"tipoEscudo":"escudo"|"vidaTemporaria"}; buff {"atributo","valor":N,"duracao":turnos 1 a 20,"modo":"turnos"|"combate"|"permanente"}; limparCondicoes {}; imunidadeTotal {"duracaoTurnos":1 a 10}; mensagem {"texto"}; contador {"id":"nome do contador","op":"somar"|"definir"|"zerar"|"dividir","valor":N,"sorteio":"NdM" opcional}; aplicarEstado {"estado":"<id>","stacks":N}; removerEstado {"estado":"<id>"} (ids de estado: ${ESTADOS.map(e => e.id).join(', ')}); ligarPoder / desligarPoder {"poderId":"nome da habilidade"}; danoEmSi {"modo":"fixo"|"percMax"|"percAtual","valor":N}; danoNoAtacante {"modo":"percDanoRecebido"|"fixo","valor":N} (devolve dano a quem atacou); ganhoPermanente {"valor":N} (soma fixa e permanente ao Poder Calculado) OU {"deContador":{"id":"nome do contador","fator":N,"zerar":true|false}} (ganho = valor atual do contador x fator; "zerar" zera o contador depois); rolarTabela {"dado":"1d6","resultados":[{"ate":3,"texto":"...","acoes":[...]}]} (até ${LIMITE_LINHAS_TABELA} faixas, "ate" estritamente crescente, sem rolarTabela dentro de rolarTabela).
  "condicoes" (opcional, lista de textos): "vida_maior_que:N", "vida_menor_que:N" (N na escala da Vida exibida), "em_combate", "empunhando_arma", "alvo_com_estado:<id>", "alvo_vida_abaixo:<%>".
  "limite" (opcional): {"max":N,"por":"turno" | "cena" | "descanso"}. O período "luta" NÃO existe: "1 vez por combate/luta/batalha" = "cena". Sem limite no texto, omita.
  Contador e Poder referenciados são os que o jogador já tem na ficha: escreva o NOME deles; se o texto citar um que você não conhece, deixe o gatilho em "naoAplicado".
  Regra que não cabe no vocabulário (outros eventos, ações ou parâmetros): NÃO invente, vai para "naoAplicado".
- "notasIA": regras que NÃO cabem nos campos acima (condições, usos por cena, testes, requisitos), em frases curtas, uma por linha.
- "naoAplicado": lista de frases curtas com tudo que o texto diz e que você NÃO conseguiu colocar em nenhum campo.

ATRIBUTOS VÁLIDOS de um efeito (use exatamente estes nomes): ${ATRIBUTOS_EFEITO.join(', ')}
PROPRIEDADE: use "base" (soma fixa) na grande maioria. Outras: reducaocusto, regeneracao (em % do máximo por turno), elemento_inato.

COMO TRADUZIR
- "+N de CA" ou "+N na CA": crie DOIS efeitos, {"atributo":"evasiva","propriedade":"base","valor":N} e {"atributo":"resistencia","propriedade":"base","valor":N}.
- "+N de Acerto" ou "+N na rolagem de ataque": {"atributo":"acerto","propriedade":"base","valor":N}.
- "+N em Força/Destreza/Inteligência...": {"atributo":"forca" (ou destreza, inteligencia...),"propriedade":"base","valor":N}.
- "reduz o dano em X%": {"atributo":"reducao_dano","propriedade":"base","valor":X}.
- Reação que reduz o dano de um ataque que acertou você em X% (ex.: "pela metade" = 50): {"atributo":"reacao_acertou","propriedade":"reduzir_dano","valor":X}.
- "+N ações/ações bônus/reações por turno": atributo acao_padrao, acao_bonus ou acao_reacao, propriedade "base".
- "+N na Iniciativa": {"atributo":"iniciativa","propriedade":"base","valor":N}.
- "imune a <condição>" / "não pode ficar <condição>": {"atributo":"imune_estado","propriedade":"base","valor":1,"escopo":"<id do estado>"} (ids: ${ESTADOS.map(e => e.id).join(', ')}; "escopo":"todos" = imune a todas as condições). Condição que não existe nessa lista vai para "naoAplicado". "Vantagem para resistir a <condição>": o mesmo, com "atributo":"resiste_estado".
- "Não pode ser surpreendido" (imunidade ao estado Surpreso): {"atributo":"imune_surpresa","propriedade":"base","valor":1}.
- "vantagem nas jogadas de ataque": {"atributo":"vantagem","propriedade":"base","valor":1,"escopo":"ataque"}. "vantagem em testes de Percepção": {"atributo":"vantagem","propriedade":"base","valor":1,"escopo":"teste:percepcao"} (escopo: "teste" = todos os testes; "teste:<perícia ou atributo>" = um só, ex.: intuicao, percepcao, procurar, furtividade, acrobacia, atletismo, trapacear, diplomacia, sentir_motiv, forca, destreza; "tudo" = ataques e testes). "desvantagem": mesmo formato com atributo "desvantagem".
- "trate um resultado de 7 ou menos no d20 como 8" (em testes de Intuição): {"atributo":"piso_d20","propriedade":"base","valor":8,"escopo":"teste:intuicao"}.
- Crítico: "Crítico a partir de 14": {"atributo":"margem_critico","propriedade":"base","valor":14}. "Crítico FATAL a partir de 19": {"atributo":"margem_critico_fatal","propriedade":"base","valor":19}. Crítico e Crítico Fatal são DIFERENTES: não troque um pelo outro. "Todo acerto contra um alvo surpreso é crítico": {"atributo":"critico_automatico","propriedade":"base","valor":1,"quando":"alvo_com_estado:surpreso"} (use "critico_fatal_automatico" se o texto disser Crítico Fatal).
- "Impõe desvantagem a quem o ataca" / "dupla desvantagem para acertá-lo": {"atributo":"desvantagem_atacante","propriedade":"base","valor":1} (valor 2 para dupla desvantagem): o efeito fica em QUEM é atacado.
- "Crítico +1 de multiplicador" / "Crítico Fatal +3 de multiplicador": {"atributo":"mult_critico","propriedade":"base","valor":1} e {"atributo":"mult_critico_fatal","propriedade":"base","valor":3} (SOMAM ao x2 do Crítico e ao x4 do Fatal; não confunda com margem_critico, que muda o d20 do crítico).
- "Sempre acerta" / "ataque certeiro" / "acerto garantido": {"atributo":"acerto_automatico","propriedade":"base","valor":1}.
- CONDIÇÃO ("quando", opcional): só use se o texto condicionar o efeito. Valores: "em_combate", "empunhando_arma" ou "empunhando_arma:<tipo, ex.: espada>", "alvo_com_estado:<id do estado>", "alvo_vida_abaixo:<%>". Sem condição, não escreva o campo. O "quando" SÓ pode ser usado nestes atributos: ${ATRIBUTOS_COM_QUANDO.join(', ')}. Para qualquer outro atributo (forca, dano, vida...), NÃO escreva "quando": o efeito condicional vai para "naoAplicado". EXCEÇÃO: em MULTIPLICADORES o "quando" só aceita "em_combate" e "empunhando_arma" (ou "empunhando_arma:<tipo>"); multiplicador que depende do alvo (alvo_com_estado, alvo_vida_abaixo) NÃO leva "quando": vai para "naoAplicado".
MULTIPLICADORES (xN no dano, xN em status, xN em poder direto, "dobra", "triplica"...): NÃO os coloque em "efeitos". Use "multiplicadores": [{"nome":"...","atributo":"poder_direto" (dano e poder também valem poder_direto; ou o atributo, ex.: forca; "dano Geral" = atributo poder_direto com tipo geral: Geral/Base/Forma/Absoluto/Único são o TIPO, nunca o atributo),"valor":N (x800 = 800),"tipo":"base" | "geral" | "formas" | "absoluto" | "unico" (SÓ se o texto disser, ex.: "dano Geral" = geral; senão "")}]. O jogador decide depois se vale sempre ou só ao ativar e confirma o tipo.
Se não existir um atributo exato para o que o texto pede, NÃO invente: coloque em "naoAplicado" e em "notasIA".

TEXTO:
${String(texto || '').trim()}

RETORNE SOMENTE UM JSON PURO, sem explicações:
{
  "poderes": [{ "nome": "X", "descricao": "Y", "categoria": "${padrao}", "danoQtd": 0, "danoFaces": 0, "custoPercentual": 0, "alcance": 0, "area": 0, "tipoAcao": "", "efeitos": [], "efeitosPassivos": [], "efeitosIncertos": [{ "nome": "Pele dura", "atributo": "evasiva", "propriedade": "base", "valor": 5 }], "multiplicadores": [], "gatilhos": [], "subHabilidades": [], "aplicaEstados": [], "notasIA": "", "naoAplicado": [] }]
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

const CHAVES_DE_LISTA = ['poderes', 'habilidades', 'formas', 'itens', 'poder', 'habilidade', 'forma', 'items', 'abilities', 'ataquesElementais', 'ataqueselementais', 'tecnicas', 'tecnicasElementais', 'magias', 'feiticos'];
const ehObjeto = (v) => v && typeof v === 'object' && !Array.isArray(v);

// A IA nem sempre obedece ao formato: aceita a lista na raiz, sob qualquer chave conhecida (ou qualquer lista de objetos), um poder
// solto (objeto com "nome") e um mapa { "Nome": { ... } }. Devolve a lista ou null.
function acharListaDePoderes(dados) {
    if (Array.isArray(dados)) return dados;
    if (!ehObjeto(dados)) return null;
    // Uma chave conhecida vazia não pode vencer outra preenchida ({"poderes":[], "habilidades":[...]}).
    const conhecida = CHAVES_DE_LISTA.find(chave => Array.isArray(dados[chave]) && dados[chave].length > 0);
    if (conhecida) return dados[conhecida];
    if (typeof dados.nome === 'string') return [dados];
    // Só vale lista de objetos COM nome: senão a lista de efeitos de um poder solto (sem "nome") seria tomada por poderes.
    const listaQualquer = Object.values(dados).find(v => Array.isArray(v) && v.some(o => ehObjeto(o) && typeof o.nome === 'string'));
    if (listaQualquer) return listaQualquer;
    const mapa = Object.values(dados).filter(v => ehObjeto(v) && typeof v.nome === 'string');
    return mapa.length ? mapa : null;
}

// Lê a resposta da IA. Devolve { ok: true, itens: [objetos] } ou { ok: false, erro }.
export function lerRespostaDaIA(texto) {
    // A instrução gerada traz exemplos de JSON: se ela for colada no lugar da resposta, o leitor tolerante os tomaria por poderes.
    if (/Atue como extrator/i.test(String(texto || ''))) return { ok: false, erro: 'Você colou a instrução (o prompt) em vez da resposta da IA. Leve a instrução à IA e cole aqui o JSON que ela devolver.' };
    const limpo = String(texto || '').replace(/```(?:json|JSON)?/g, ' ');
    // Varre os blocos de JSON do texto, do primeiro ao último. Texto solto antes da resposta ("veja [1]", "[nota]") não pode
    // esconder a resposta de verdade: um bloco que não parseia é tentado de novo um caractere adiante; um bloco que parseia mas
    // não rende itens é PULADO (nunca se entra nele, senão a lista de efeitos de um poder viraria "poderes").
    let pos = 0;
    let acheiBloco = false;
    let primeiroLido;
    let listaVazia = false;
    for (;;) {
        const bruto = extrairJson(limpo, pos);
        if (!bruto) break;
        acheiBloco = true;
        const inicio = limpo.indexOf(bruto, pos);
        let dados;
        try { dados = JSON.parse(bruto); } catch (e) { pos = inicio + 1; continue; }
        if (primeiroLido === undefined) primeiroLido = dados;
        const lista = acharListaDePoderes(dados);
        if (Array.isArray(lista)) {
            const itens = lista.filter(ehObjeto);
            if (itens.length) return { ok: true, itens };
            listaVazia = true;
        }
        pos = inicio + bruto.length;
    }
    if (!acheiBloco) return { ok: false, erro: 'Não achei um JSON na resposta. Cole a resposta completa da IA.' };
    if (primeiroLido === undefined) return { ok: false, erro: 'O JSON está incompleto ou com erro. Peça à IA para devolver de novo, só o JSON.' };
    if (listaVazia) return { ok: false, erro: 'A lista "poderes" veio vazia.' };
    const chaves = ehObjeto(primeiroLido) ? Object.keys(primeiroLido).slice(0, 8).join(', ') : '';
    return { ok: false, erro: `O JSON foi lido, mas não achei nele a lista de habilidades${chaves ? ` (chaves encontradas: ${chaves})` : ''}. Peça à IA para devolver {"poderes": [ ... ]}.` };
}

const num = (v, padrao = 0) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : padrao; };
const minusculo = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const existeNaLista = (lista, v) => lista.some(op => minusculo(op) === minusculo(v));
// Lista de frases sem vazias e sem repetidas (a IA costuma repetir o mesmo item em notasIA e em naoAplicado).
const textoLista = (v) => {
    const vistos = new Set();
    return (Array.isArray(v) ? v : (v ? [v] : [])).map(s => String(s ?? '').trim()).filter(s => {
        const chave = s.toLowerCase();
        if (!s || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
};
// A IA às vezes devolve a categoria no plural ou fora da lista: aceita o plural e, se não reconhecer, usa a aba aberta.
const CATEGORIA_POR_NOME = { habilidade: 'habilidade', habilidades: 'habilidade', poder: 'poder', poderes: 'poder', forma: 'forma', formas: 'forma' };
const categoriaDoItem = (v, padrao) => CATEGORIA_POR_NOME[minusculo(v)] || padrao;
const descreverEfeito = (e) => `${e && e.nome ? `${e.nome}: ` : ''}${e && e.atributo ? e.atributo : '?'} ${e && e.propriedade ? e.propriedade : '?'} ${e && e.valor !== undefined ? e.valor : '?'}`;

// Tira os efeitos que não vamos importar (multiplicadores) ou que não têm valor numérico; o que sair vira texto em `naoAplicado`.
function separarEfeitosImportaveis(lista, naoAplicado) {
    return (Array.isArray(lista) ? lista : []).filter((e) => {
        if (!e || typeof e !== 'object') {
            if (typeof e === 'string' && e.trim()) naoAplicado.push(`Efeito em formato inválido não importado (${e.trim()})`);
            return false;
        }
        if (Object.keys(e).length === 0) return false; // {} não diz nada: não polui as notas
        if (!existeNaLista(ATRIBUTOS_EFEITO, e.atributo) || !existeNaLista(PROPRIEDADES_EFEITO, e.propriedade)) {
            naoAplicado.push(`Efeito que o sistema ainda não tem, não importado (${descreverEfeito(e)})`);
            return false;
        }
        if (PROPRIEDADES_NAO_IMPORTADAS.includes(minusculo(e.propriedade))) {
            naoAplicado.push(`Multiplicador não importado (${descreverEfeito(e)})`);
            return false;
        }
        const condicao = String(e.quando ?? '').trim();
        if (condicao && minusculo(condicao) !== 'sempre' && !ATRIBUTOS_COM_QUANDO.includes(minusculo(e.atributo))) {
            naoAplicado.push(`Efeito condicional que o sistema ainda não suporta nesse atributo, não importado (${descreverEfeito(e)}; quando: ${condicao})`);
            return false;
        }
        if (ATRIBUTOS_NAO_IMPORTADOS.includes(minusculo(e.atributo))) {
            naoAplicado.push(`Efeito em dano não importado (${descreverEfeito(e)})`);
            return false;
        }
        if (!Number.isFinite(parseFloat(String(e.valor ?? '').replace(',', '.')))) {
            naoAplicado.push(`Efeito sem valor numérico não importado (${descreverEfeito(e)})`);
            return false;
        }
        return true;
    }).map(e => ({ ...e, valor: num(e.valor) }));
}

// Tipos de multiplicador do sistema (propriedade do efeito) que o jogador escolhe na prévia.
export const TIPOS_MULTIPLICADOR = [
    { id: 'mbase', rotulo: 'Base' },
    { id: 'mgeral', rotulo: 'Geral' },
    { id: 'mformas', rotulo: 'Forma' },
    { id: 'mabs', rotulo: 'Absoluto' },
    { id: 'munico', rotulo: 'Único' },
];
const TIPO_POR_NOME = { base: 'mbase', mbase: 'mbase', geral: 'mgeral', mgeral: 'mgeral', forma: 'mformas', formas: 'mformas', mformas: 'mformas', absoluto: 'mabs', abs: 'mabs', mabs: 'mabs', unico: 'munico', munico: 'munico' };
// 'geral' aqui é o TIPO ("dano Geral"), não o atributo "geral" (que multiplicaria todos os status): vira Poder Direto.
const ATRIBUTO_COMO_PODER_DIRETO = ['dano', 'poder', 'poder_direto', 'poder direto', 'poderdireto', 'geral'];
const ehMultiplicador = (e) => !!e && typeof e === 'object' && PROPRIEDADES_NAO_IMPORTADAS.includes(minusculo(e.propriedade));
const semMultiplicadores = (lista) => (Array.isArray(lista) ? lista : []).filter(e => !ehMultiplicador(e));
export const ehTipoMultiplicador = (v) => TIPOS_MULTIPLICADOR.some(t => t.id === v);

// Multiplicador da IA -> item pendente da prévia { nome, atributo, propriedade: tipo ou '', valor, destino, multiplicador: true }.
// 'dano' e 'poder' viram Poder Direto (o multiplicador de dano das fichas antigas virou aumento do Poder Calculado).
function prepararMultiplicador(bruto, destinoInicial, naoAplicado) {
    if (!bruto || typeof bruto !== 'object') return null;
    const valor = parseFloat(String(bruto.valor ?? '').replace(',', '.'));
    const atributoBruto = minusculo(bruto.atributo) || 'poder_direto';
    const atributo = ATRIBUTO_COMO_PODER_DIRETO.includes(atributoBruto) ? 'poder_direto' : (ATRIBUTOS_EFEITO.find(a => minusculo(a) === atributoBruto) || '');
    if (!Number.isFinite(valor) || valor <= 0 || !atributo) {
        naoAplicado.push(`Multiplicador não importado (${bruto.nome ? `${bruto.nome}: ` : ''}${bruto.atributo || '?'} x${bruto.valor ?? '?'})`);
        return null;
    }
    // Sem tipo explícito, "geral" no atributo ("dano Geral") indica o tipo Geral.
    const tipo = TIPO_POR_NOME[minusculo(bruto.tipo ?? bruto.propriedade)] || (atributoBruto === 'geral' ? 'mgeral' : '');
    // Condição ("quando"): o multiplicador só aceita em_combate e empunhando_arma[:tipo]; qualquer outra (alvo, inválida) não é importada.
    const quandoBruto = String(bruto.quando ?? '').trim();
    const quando = quandoBruto ? normalizarQuandoMultiplicador(quandoBruto) : '';
    if (quando === null) {
        naoAplicado.push(`Multiplicador condicional que o sistema não suporta, não importado (${bruto.nome ? `${bruto.nome}: ` : ''}${bruto.atributo || '?'} x${bruto.valor ?? '?'}; quando: ${quandoBruto}). Multiplicador só aceita em_combate e empunhando_arma.`);
        return null;
    }
    return { nome: String(bruto.nome ?? '').trim(), atributo, propriedade: tipo, valor, ...(quando ? { quando } : {}), destino: destinoInicial || '', multiplicador: true };
}

// Todos os multiplicadores de um item da IA (campo "multiplicadores" e efeitos com propriedade de multiplicador).
// Quem veio de "efeitos"/"efeitosPassivos" já traz a ativação que a IA decidiu; os demais esperam o jogador.
function colherMultiplicadores(p, naoAplicado) {
    const lista = [];
    const adiciona = (fonte, destino) => (Array.isArray(fonte) ? fonte : []).forEach(m => {
        if (destino !== undefined && !ehMultiplicador(m)) return;
        const r = prepararMultiplicador(m, destino, naoAplicado);
        if (r) lista.push(r);
    });
    adiciona(p.multiplicadores, undefined);
    adiciona(p.efeitos, 'ativo');
    adiciona(p.efeitosPassivos, 'passivo');
    adiciona(p.efeitosIncertos, '');
    return lista;
}

// Valida UM item vindo da IA e devolve { objeto, avisos, naoAplicado, valido }. `objeto` já está no formato do Grimório (sem id).
export function prepararItemImportado(bruto, categoriaPadrao = 'habilidade') {
    const p = bruto && typeof bruto === 'object' ? bruto : {};
    const naoAplicado = textoLista(p.naoAplicado);
    const faces = num(p.danoFaces ?? p.dadosFaces);
    const dados = {
        ...p,
        categoria: categoriaDoItem(p.categoria, categoriaPadrao),
        dadosQtd: Math.max(0, Math.floor(num(p.danoQtd ?? p.dadosQtd))),
        dadosFaces: faces > 0 ? Math.floor(faces) : undefined,
        custoPercentual: num(p.custoPercentual),
        alcance: num(p.alcance),
        area: num(p.area),
        fadigaPorUso: num(p.fadigaPorUso),
        efeitos: separarEfeitosImportaveis(semMultiplicadores(p.efeitos), naoAplicado),
        efeitosPassivos: separarEfeitosImportaveis(semMultiplicadores(p.efeitosPassivos), naoAplicado),
        gatilhos: undefined, // validados abaixo (lerGatilhosDaIA): normalizarPoder não os vê
    };
    const gatilhosLidos = lerGatilhosDaIA(p.gatilhos);
    naoAplicado.push(...gatilhosLidos.naoAplicado);
    const multiplicadores = colherMultiplicadores(p, naoAplicado);
    if (p.suporte && typeof p.suporte === 'object' && Array.isArray(p.suporte.buffs)) {
        dados.suporte = { ...p.suporte, buffs: separarEfeitosImportaveis(p.suporte.buffs, naoAplicado) };
    }
    const { objeto, avisos, valido } = normalizarPoder(dados);
    avisos.push(...gatilhosLidos.avisos);
    // Gatilhos esperam o jogador responder "automático ou opcional?" na prévia: a IA nunca decide o modo.
    if (gatilhosLidos.gatilhos.length) objeto.gatilhos = marcarGatilhosPendentes(gatilhosLidos.gatilhos);
    objeto.custoPercentualMax = 0;
    objeto.semComoPoder = false;
    // Efeitos sem ativação clara esperam o jogador decidir (Ao ativar x Sempre) na prévia: nada é aplicado antes disso.
    const incertos = [...separarEfeitosImportaveis(semMultiplicadores(p.efeitosIncertos), naoAplicado).map(e => ({ ...e, destino: '' })), ...multiplicadores];
    if (incertos.length) objeto.efeitosIncertos = incertos;
    // Sub-habilidades: viram Formas Místicas do próprio Poder (id definido só na hora de gravar).
    const subs = (Array.isArray(p.subHabilidades) ? p.subHabilidades : []).map(s => prepararSubHabilidade(s, avisos)).filter(Boolean);
    if (subs.length) objeto.formas = subs;
    objeto.naoAplicado = naoAplicado;
    objeto.notasIA = juntarNotas(objeto.notasIA, naoAplicado);
    return { objeto, avisos, naoAplicado, valido };
}

// Uma sub-habilidade da IA -> Forma Mística com um Modo ("Padrão") que carrega os efeitos. Ação e usos entram no texto do Modo.
function prepararSubHabilidade(bruto, avisos = []) {
    const s = bruto && typeof bruto === 'object' ? bruto : null;
    const nome = String(s && s.nome ? s.nome : '').trim();
    if (!nome) return null;
    const naoAplicado = textoLista(s.naoAplicado);
    const efeitos = separarEfeitosImportaveis(semMultiplicadores(s.efeitos), naoAplicado);
    const efeitosPassivos = separarEfeitosImportaveis(semMultiplicadores(s.efeitosPassivos), naoAplicado);
    const incertos = [...separarEfeitosImportaveis(semMultiplicadores(s.efeitosIncertos), naoAplicado).map(e => ({ ...e, destino: '' })), ...colherMultiplicadores(s, naoAplicado)];
    const gatilhosLidos = lerGatilhosDaIA(s.gatilhos);
    naoAplicado.push(...gatilhosLidos.naoAplicado);
    avisos.push(...gatilhosLidos.avisos.map(a => `${nome}: ${a}`));
    const detalhes = [];
    const acao = String(s.tipoAcao ?? '').trim();
    if (acao) detalhes.push(`Ação: ${acao}`);
    const usos = Math.floor(num(s.usosMax));
    if (usos > 0) detalhes.push(`Usos: ${usos} por ${minusculo(s.usosPor) === 'cena' ? 'cena' : 'descanso'}`);
    const recargaSub = Math.floor(num(s.recargaTurnos));
    if (recargaSub > 0) detalhes.push(`Recarga: ${recargaSub} turno(s)`);
    const custoSub = lerCustoPorTurno(s.custoPorTurno).custo;
    if (custoSub) detalhes.push(`Custo por turno: ${custoSub.valor}${custoSub.modo === 'percMax' ? '%' : ''} de ${custoSub.energia}`);
    const descricao = String(s.descricao ?? '').trim();
    const notas = juntarNotas('', naoAplicado);
    const texto = [descricao, detalhes.join(' · '), notas].filter(Boolean).join('\n\n');
    return {
        nome, descricao: texto, imagemUrl: '', acumulaFormaBase: true, efeitos: [], efeitosPassivos: [],
        configs: [{ nome: 'Padrão', descricao: '', imagemUrl: '', efeitos, efeitosPassivos, efeitosIncertos: incertos }],
        ...(gatilhosLidos.gatilhos.length ? { gatilhos: marcarGatilhosPendentes(gatilhosLidos.gatilhos) } : {}),
        naoAplicado,
    };
}

// Gatilhos importados: [{ onde: 'pai' | índice da forma, indice, gatilho }] (todos, respondidos ou não).
export function listarGatilhosImportados(objeto) {
    const lista = [];
    ((objeto && objeto.gatilhos) || []).forEach((gatilho, indice) => lista.push({ onde: 'pai', indice, gatilho }));
    ((objeto && objeto.formas) || []).forEach((forma, f) => {
        ((forma && forma.gatilhos) || []).forEach((gatilho, indice) => lista.push({ onde: f, indice, gatilho }));
    });
    return lista;
}

// Efeitos à espera de decisão: [{ onde: 'pai' | índice da forma, indice, efeito }]. A prévia usa para perguntar ao jogador.
export function listarEfeitosIncertos(objeto) {
    const lista = [];
    ((objeto && objeto.efeitosIncertos) || []).forEach((efeito, indice) => lista.push({ onde: 'pai', indice, efeito }));
    ((objeto && objeto.formas) || []).forEach((forma, f) => {
        ((forma.configs && forma.configs[0] && forma.configs[0].efeitosIncertos) || []).forEach((efeito, indice) => lista.push({ onde: f, indice, efeito }));
    });
    return lista;
}

// Falta responder: a ativação (Só ao ativar / Sempre) e, nos multiplicadores, também o tipo.
export const faltaResponder = (efeito) => !efeito || (efeito.destino !== 'ativo' && efeito.destino !== 'passivo') || (!!efeito.multiplicador && !ehTipoMultiplicador(efeito.propriedade));
export const faltaResponderGatilho = gatilhoFaltaResponder;
export const contarGatilhosPendentes = (objeto) => listarGatilhosImportados(objeto).filter(i => gatilhoFaltaResponder(i.gatilho)).length;
export const contarPendentes = (objeto) => listarEfeitosIncertos(objeto).filter(i => faltaResponder(i.efeito)).length + contarGatilhosPendentes(objeto);

function alterarIncerto(objeto, onde, indice, alterar) {
    const copia = JSON.parse(JSON.stringify(objeto || {}));
    const lista = onde === 'pai' ? copia.efeitosIncertos : (copia.formas && copia.formas[onde] && copia.formas[onde].configs && copia.formas[onde].configs[0].efeitosIncertos);
    if (lista && lista[indice]) alterar(lista[indice]);
    return copia;
}

// Grava a escolha ('ativo' | 'passivo' | '' para desfazer) de um efeito incerto. Devolve um objeto novo.
export function decidirEfeitoIncerto(objeto, onde, indice, destino) {
    return alterarIncerto(objeto, onde, indice, (e) => { e.destino = destino === 'ativo' || destino === 'passivo' ? destino : ''; });
}

// Escolhe o tipo ('mbase' | 'mgeral' | 'mformas' | 'mabs' | 'munico') de um multiplicador pendente. Devolve um objeto novo.
export function definirTipoMultiplicador(objeto, onde, indice, tipo) {
    return alterarIncerto(objeto, onde, indice, (e) => { if (e.multiplicador) e.propriedade = ehTipoMultiplicador(tipo) ? tipo : ''; });
}

function alterarGatilho(objeto, onde, indice, alterar) {
    const copia = JSON.parse(JSON.stringify(objeto || {}));
    const lista = onde === 'pai' ? copia.gatilhos : (copia.formas && copia.formas[onde] && copia.formas[onde].gatilhos);
    if (lista && lista[indice]) lista[indice] = alterar(lista[indice]);
    return copia;
}

// Grava a resposta de um gatilho ('automatico' | 'opcional' | '' para desfazer). Opcional entra desarmado. Devolve um objeto novo.
export function decidirModoGatilhoImportado(objeto, onde, indice, modo) {
    return alterarGatilho(objeto, onde, indice, g => decidirModoDoGatilho(g, modo));
}

export function decidirTodosOsGatilhos(objeto, modo) {
    let atual = objeto;
    listarGatilhosImportados(objeto).forEach(i => { atual = decidirModoGatilhoImportado(atual, i.onde, i.indice, modo); });
    return atual;
}

// Decide todos os incertos de uma vez ('ativo' | 'passivo').
export function decidirTodosOsIncertos(objeto, destino) {
    let atual = objeto;
    listarEfeitosIncertos(objeto).forEach(i => { atual = decidirEfeitoIncerto(atual, i.onde, i.indice, destino); });
    return atual;
}

// Move os incertos decididos para efeitos / efeitosPassivos. Sem decisão (atalho sem prévia) vale 'ativo': só funciona com o poder ligado, nunca de graça.
// Multiplicador sem tipo escolhido (só no atalho sem prévia) NÃO é aplicado: devolve o texto para a nota.
function resolverIncertos(alvo) {
    const incertos = alvo.efeitosIncertos || [];
    delete alvo.efeitosIncertos;
    const naoAplicados = [];
    incertos.forEach(({ destino, multiplicador, ...bruto }) => {
        let efeito = bruto;
        if (multiplicador) {
            const rotulo = `${efeito.nome ? `${efeito.nome}: ` : ''}${efeito.atributo} x${efeito.valor}`;
            if (!ehTipoMultiplicador(efeito.propriedade)) { naoAplicados.push(`Multiplicador sem tipo escolhido, não aplicado (${rotulo})`); return; }
            // Só no Poder Direto Base/Geral/Forma/Absoluto SOMAM a 1 ((1+Σ), core/poder.js): "x800" grava 799.
            // Nos demais atributos (core/attributes.js getBuffs) e no Único o valor já é o fator: "x800" grava 800.
            if (efeito.atributo === 'poder_direto' && efeito.propriedade !== 'munico') {
                if (efeito.valor <= 1) { naoAplicados.push(`Multiplicador x${efeito.valor} não muda nada nesse tipo, não aplicado (${rotulo})`); return; }
                efeito = { ...efeito, valor: efeito.valor - 1 };
            }
        }
        if (destino === 'passivo') alvo.efeitosPassivos = [...(alvo.efeitosPassivos || []), efeito];
        else alvo.efeitos = [...(alvo.efeitos || []), efeito];
    });
    return naoAplicados;
}

// Notas finais do poder: o que a IA escreveu + o que não foi aplicado, para nada se perder.
export function juntarNotas(notas, naoAplicado) {
    const lista = textoLista(naoAplicado);
    const bloco = lista.length ? `Não aplicado automaticamente:\n${lista.map(s => `- ${s}`).join('\n')}` : '';
    // O bloco "não aplicado" é o que mais importa não perder: se faltar espaço, corta-se o texto da IA, não o bloco.
    const espaco = bloco ? Math.max(0, LIMITE_NOTAS - bloco.length - 2) : LIMITE_NOTAS;
    const base = String(notas || '').trim().substring(0, espaco).trim();
    return [base, bloco].filter(Boolean).join('\n\n').substring(0, LIMITE_NOTAS);
}

// Prepara a lista inteira para a prévia: [{ chave, marcado, objeto, avisos, naoAplicado, valido }].
export function prepararImportacao(itens, categoriaPadrao = 'habilidade', chaveInicial = 1) {
    return (Array.isArray(itens) ? itens : []).map((bruto, i) => {
        const r = prepararItemImportado(bruto, categoriaPadrao);
        return { chave: chaveInicial + i, marcado: r.valido, objeto: r.objeto, avisos: r.avisos, naoAplicado: r.naoAplicado, valido: r.valido };
    });
}

// Troca a categoria de um item da prévia mantendo os campos coerentes (Forma tem fadiga; Habilidade/Poder têm Maestria Requerida).
export function mudarCategoriaImportada(objeto, categoria) {
    if (!objeto || !CATEGORIAS_PODER.includes(categoria)) return objeto;
    const novo = { ...objeto, categoria };
    if (categoria === 'forma') {
        delete novo.maestriaRequerida;
        novo.fadigaPorUso = novo.fadigaPorUso ?? 0;
    } else {
        delete novo.fadigaPorUso;
        novo.maestriaRequerida = novo.maestriaRequerida ?? 0;
    }
    return novo;
}

// Resumo de uma linha para a prévia.
export function resumirItemImportado(objeto) {
    return objeto ? resumirProposta('poder', objeto, { extras: false }) : '';
}

// Poder pronto para ir para ficha.poderes: cópia profunda (a prévia e a ficha nunca dividem objetos) + id.
export function montarPoderFinal(objeto, id) {
    const copia = JSON.parse(JSON.stringify(objeto || {}));
    delete copia.naoAplicado;
    if (Array.isArray(copia.gatilhos)) copia.gatilhos = copia.gatilhos.map(finalizarGatilho);
    if (!copia.gatilhos || copia.gatilhos.length === 0) delete copia.gatilhos;
    const semTipo = resolverIncertos(copia);
    if (semTipo.length) copia.notasIA = [copia.notasIA, ...semTipo].filter(Boolean).join('\n');
    if (Array.isArray(copia.formas)) {
        // Ids únicos dentro do Poder: a Forma e o seu Modo.
        copia.formas = copia.formas.map((forma, i) => {
            const { naoAplicado, ...resto } = forma;
            if (Array.isArray(resto.gatilhos)) resto.gatilhos = resto.gatilhos.map(finalizarGatilho);
            if (!resto.gatilhos || resto.gatilhos.length === 0) delete resto.gatilhos;
            const formaId = typeof id === 'number' && Number.isFinite(id) ? id * 100 + i * 2 + 1 : `${id}_f${i + 1}`;
            const config = { ...(resto.configs && resto.configs[0] ? resto.configs[0] : {}), id: typeof formaId === 'number' ? formaId + 1 : `${formaId}_m1` };
            const semTipoSub = resolverIncertos(config);
            if (semTipoSub.length) resto.descricao = [resto.descricao, ...semTipoSub].filter(Boolean).join('\n');
            return { ...resto, id: formaId, configs: [config] };
        });
    }
    return { ...copia, id };
}

// Compatibilidade: um item vindo da IA direto para o formato do Grimório (usado antes da prévia existir).
export function montarPoderImportado(p, categoria, id) {
    return montarPoderFinal(prepararItemImportado(p, categoria).objeto, id);
}
