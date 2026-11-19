// ==========================================
// SEXTA-FEIRA — CRIAÇÃO COM CONFIRMAÇÃO (lógica pura).
//
// A Sexta-Feira nunca grava nada sozinha: ela chama uma ferramenta propor_* e o app monta aqui um
// objeto no MESMO formato que as telas do app criam (Grimório de Poderes, Técnicas Elementais,
// Arsenal, Mapa), com valores inválidos corrigidos e avisos de equilíbrio. A proposta vira um cartão
// no chat: o Mestre aplica; o jogador manda pra aprovação do Mestre.
//
// Formatos espelhados de:
//   poder/habilidade/forma -> components/poderes/PoderesFormContext.jsx (salvarNovoPoder)
//   magia                  -> components/arsenal/ElementosFormContext.jsx (salvarNovoElem)
//   item                   -> components/arsenal/ArsenalFormContext.jsx (salvarNovoItem)
//   npc (dummie do Mapa)   -> components/mapa/MapaFerramentasMestre.jsx (criar dummie)
// ==========================================
import { dadosLimitadosDaTecnica } from './limiteDados.js';
import { ATRIBUTOS_AGRUPADOS, PROPRIEDADE_OPTIONS, GRUPO_REACOES, GRUPO_IDENTIFICACAO, PROPRIEDADES_REACAO } from './efeitos-constants.js';
import { normalizarPasta } from './pastas.js';
import { normalizarTipoAcao } from './acoesTecnica.js';
import { normalizarUsos } from './usosPoder.js';
import { normalizarAoAcertar } from './aoAcertar.js';
import { lerCustosPorTurno, custoPorTurnoParaSalvar } from './custoPorTurno.js';
import { normalizarEscudoAoLigar } from './escudos.js';
import { normalizarRecarga, LIMITE_RECARGA } from './recargaPoder.js';
import { normalizarReutilizacao, descreverReutilizacao, LIMITE_REUSOS } from './reutilizacao.js';
import { normalizarAoDesligar } from './aoDesligar.js';
import { lerGatilhosDaIA } from './gatilhosImportacao.js';
import { EVENTOS_GATILHO, ACOES_GATILHO, PERIODOS_GATILHO, NIVEIS_ACERTO, OPS_CONTADOR_ACAO, OPS_CONTADOR_EVENTO, LIMITE_GATILHOS_POR_FONTE, LIMITE_ACOES_POR_GATILHO, LIMITE_LINHAS_TABELA, LIMITE_OPCOES_ESCOLHA, descreverGatilho } from './gatilhos.js';
import { fatoresComApelidos } from './formulaDano.js';
import { ATRIBUTO_DANO_DADOS, LIMITES_DANO_DADOS, normalizarValorDanoDados, dadoDoEfeito, normalizarDadosExtra, normalizarStatusFatores, resumirFormulaDeDano } from './danoDados.js';
import { normalizarQuando, normalizarQuandoMultiplicador, ehPropriedadeMultiplicador, normalizarEscopo, ATRIBUTOS_COM_QUANDO, ATRIBUTOS_COM_ESCOPO, ATRIBUTOS_COM_ESCOPO_ESTADO } from './efeitosCondicionais.js';
import { efeitoPodeValerParaAliados } from './efeitosDeAliados.js';
import { efeitoPodeValerParaInimigos } from './efeitosDeInimigos.js';
import { efeitoAceitaEscalaMovimento, normalizarEscalaMovimento, LIMITE_MAX_ESCALA_MOVIMENTO } from './movimentoNoTurno.js';
import { normalizarFiltroAliado, filtroAliadoParaTexto } from './aliadosEmCampo.js';
import { FATOR_EXIBICAO_VITAIS } from './vitals.js';
import { descreverDuracaoSpec } from './duracaoEstados.js';
import { normalizarAplicaEstados, ATRIBUTOS_TESTE, ROTULO_ATRIBUTO, LIMITES_ESTADOS } from './estadosGolpe.js';
import { ESTADOS, nomeDoEstado, iconeDoEstado, MAX_STACKS } from './condicoes.js';
import { normalizarReflexo, MODOS_REFLEXO, ENERGIAS_REFLEXO } from './reflexo.js';
import { normalizarSuporte, MODOS_ALVO_SUPORTE, ACOES_SUPORTE, LIMITES_SUPORTE } from './suporte.js';
import { IDS_CATEGORIA_PODER, CATEGORIAS_PODER as CATEGORIAS_PODER_INFO, categoriaLiberadaNaFicha } from './categoriasPoder.js';
import { normalizarCombo, normalizarFollowUp, resumirCombo, TIPOS_GOLPE, ACOES_GOLPE, QUANDO_FOLLOW_UP, LIMITES as LIMITES_COMBO } from './combos.js';

// Inclui as Reações (efeito reacao_<gatilho> + propriedade do efeito): a Sexta-Feira não pode rebaixá-las a efeito numérico comum.
export const ATRIBUTOS_EFEITO = [...ATRIBUTOS_AGRUPADOS.flatMap(g => g.options), ...GRUPO_REACOES.options, ...GRUPO_IDENTIFICACAO.options];
export const PROPRIEDADES_EFEITO = [...PROPRIEDADE_OPTIONS, ...PROPRIEDADES_REACAO];
// Ids das categorias de poder (lista única em core/categoriasPoder.js; aqui só os ids, usados nos enums e validações).
export const CATEGORIAS_PODER = IDS_CATEGORIA_PODER;
export const VERTENTES_PODER = ['', 'Acumulativo', 'Elemental', 'Conceitual', 'Utilitario'];
export const TIPOS_MECANICA_MAGIA = ['ataque', 'saving', 'infusao', 'suporte'];
export const ATRIBUTOS_SAVING = ['forca', 'destreza', 'constituicao', 'sabedoria', 'inteligencia', 'stamina', 'carisma', 'energiaEsp'];
export const BONUS_MAGIA = ['nenhum', 'mult_dano', 'dano_bruto', 'letalidade'];
export const ENERGIAS_COMBUSTAO = ['flexivel', 'mana', 'aura', 'chakra', 'corpo', 'pontosVitais', 'pontosMortais', 'livre'];
export const ALVOS_MAGIA = ['todos', 'inimigos', 'aliados'];
export const TIPOS_ITEM = ['arma', 'armadura', 'artefato'];
export const TIPOS_ARMA = ['espada', 'arco', 'lança', 'machado', 'adaga', 'cajado', 'arma de fogo', 'manopla', 'foice', 'chicote', 'martelo', 'escudo'];
export const RARIDADES_ITEM = ['comum', 'rara', 'avançada', 'lendaria', 'lendaria (Longuinus)', 'espiritual', 'fantasma nobre'];
export const BONUS_ITEM = ['mult_dano', 'dano_bruto', 'letalidade', 'bonus_acerto', 'bonus_evasiva', 'bonus_resistencia', 'mult_escudo'];
export const DEFESAS_NPC = ['evasiva', 'resistencia'];

// Elementos das abas das Técnicas Elementais (components/arsenal/ElementosFormContext.jsx >
// ABAS_GRIMORIO_STATIC). Um nome fora daqui ainda é aceito, mas cai em "Pergaminhos Perdidos".
export const ELEMENTOS_CONHECIDOS = [
    'Fogo', 'Raio', 'Vento', 'Agua', 'Terra', 'Neutro',
    'Fogo Verdadeiro', 'Raio Verdadeiro', 'Agua Verdadeira', 'Vento Verdadeiro', 'Terra Verdadeira',
    'Solar', 'Energia', 'Gelo', 'Vacuo', 'Natureza',
    'Solar Verdadeiro', 'Energia Verdadeira', 'Gelo Verdadeiro', 'Vacuo Verdadeiro', 'Natureza Verdadeira',
    'Luz', 'Trevas', 'Ether', 'Celestial', 'Infernal', 'Caos', 'Criacao', 'Destruicao', 'Cosmos', 'Vida', 'Morte', 'Vazio',
    'Aura Pura', 'Projeção de Aura', 'Artes Marciais', 'Reforço Físico', 'Fusões Básicas', 'Fusões Avançadas',
];
export const VISIBILIDADES_HP = ['todos', 'mestre'];

// Ranks da Tier List (mesma ordem/ids de TODOS_RANKS em components/ia/AIFormContext.jsx).
export const IDS_RANKS = [
    'EX', 'Z+', 'Z', 'Z-', 'S+', 'S', 'S-', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
    ...['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'].flatMap(l => [`${l}+`, l, `${l}-`]),
];

// Onde cada tipo entra na ficha.
export const CAMPO_FICHA_POR_TIPO = { poder: 'poderes', magia: 'ataquesElementais', item: 'inventario', combo: 'combos', followup: 'followUps' };
export const ROTULO_TIPO = { poder: 'Habilidade/Poder/Forma', magia: 'Técnica Elemental', item: 'Item do Arsenal', npc: 'NPC do Mapa', tierlist: 'Tier List', combo: 'Combo', followup: 'Follow Up' };
// O que um jogador pode pedir pra própria ficha (o resto é só do Mestre).
export const TIPOS_PEDIDO_JOGADOR = ['poder', 'magia', 'item', 'combo', 'followup'];

// 🔔 Onde um pedido vai parar na ficha, pra notificação do Mestre e pro Grimório abrir no lugar certo.
//   secao  — bloco do Grimório do Mestre: 'poderes' | 'magias' | 'inventario'
//   pagina — aba da ficha (mesmos nomes do menu lateral)
//   local  — onde dentro da aba (sub-aba, pasta, elemento)
//   tipo   — o que é, em uma linha
//   oQue / botaoVer — textos da notificação ("pediu uma Habilidade", "Ver a Habilidade")
const CATEGORIA_PODER_TEXTO = Object.fromEntries(CATEGORIAS_PODER_INFO.map(c => [c.id, c.singular]));
const ARTIGOS_PODER = Object.fromEntries(CATEGORIAS_PODER_INFO.map(c => [c.id, c.artigo]));
const SUBABA_PODER_TEXTO = Object.fromEntries(CATEGORIAS_PODER_INFO.map(c => [c.id, c.nome]));
const TIPO_ITEM_TEXTO = { arma: 'Arma', armadura: 'Armadura', artefato: 'Artefato' };
const MECANICA_MAGIA_TEXTO = { ataque: 'Ataque', saving: 'Teste de resistência', infusao: 'Infusão', suporte: 'Suporte' };

export function descreverDestinoPedido(tipo, objeto) {
    const o = objeto || {};
    if (tipo === 'poder') {
        const categoria = IDS_CATEGORIA_PODER.includes(o.categoria) ? o.categoria : 'habilidade';
        const pasta = String(o.pasta || '').trim();
        const vertente = String(o.vertente || '').trim();
        return {
            secao: 'poderes',
            pagina: 'Poderes Clássicos',
            local: `${SUBABA_PODER_TEXTO[categoria]}${pasta ? ` › pasta "${pasta}"` : ''}`,
            tipo: [CATEGORIA_PODER_TEXTO[categoria], vertente && `${vertente}${o.elemento ? ` (${o.elemento})` : ''}`].filter(Boolean).join(' · '),
            oQue: `${ARTIGOS_PODER[categoria][0]} ${CATEGORIA_PODER_TEXTO[categoria]}`,
            botaoVer: `Ver ${ARTIGOS_PODER[categoria][1]} ${CATEGORIA_PODER_TEXTO[categoria]}`,
        };
    }
    if (tipo === 'magia') {
        const elemento = String(o.elemento || '').trim() || 'Neutro';
        return {
            secao: 'magias',
            pagina: 'Elementos',
            local: `Pergaminhos de ${elemento}`,
            tipo: `Técnica Elemental · ${MECANICA_MAGIA_TEXTO[o.tipoMecanica] || o.tipoMecanica || 'Ataque'}`,
            oQue: 'uma Técnica Elemental',
            botaoVer: 'Ver a Técnica',
        };
    }
    if (tipo === 'item') {
        return {
            secao: 'inventario',
            pagina: 'Inventário',
            local: 'Mochila (não equipado)',
            tipo: [TIPO_ITEM_TEXTO[o.tipo] || 'Item', o.armaTipo, o.raridade].filter(Boolean).join(' · '),
            oQue: 'um Item',
            botaoVer: 'Ver o Item',
        };
    }
    if (tipo === 'combo' || tipo === 'followup') {
        const combo = tipo === 'combo';
        return { secao: 'combos', pagina: 'Ficha Definitiva', local: `Combate › Combos › ${combo ? 'Meus Combos' : 'Follow Ups'}`, tipo: combo ? 'Combo' : 'Follow Up', oQue: combo ? 'um Combo' : 'um Follow Up', botaoVer: combo ? 'Ver o Combo' : 'Ver o Follow Up' };
    }
    return { secao: '', pagina: '', local: '', tipo: ROTULO_TIPO[tipo] || String(tipo || ''), oQue: 'uma criação', botaoVer: 'Ver o pedido' };
}

// Pedidos da fila prontos pra MOSTRAR, do mais novo pro mais antigo: [id, pedido][]. Qualquer um da
// mesa consegue escrever na fila, então cada pedido sai normalizado (mesmo formato das telas, textos
// como texto, avisos como lista): um pedido malformado nunca quebra a tela do Mestre. Gravar continua
// passando pela validação própria (hooks/usePedidosCriacao.js), que relê o pedido do banco.
export function ordenarPedidosPendentes(pendentes) {
    if (!pendentes || typeof pendentes !== 'object') return [];
    const lista = [];
    Object.entries(pendentes).forEach(([id, p]) => {
        if (!p || typeof p !== 'object' || !p.objeto || typeof p.objeto !== 'object' || !TIPOS_PEDIDO_JOGADOR.includes(p.tipo)) return;
        const { objeto, valido } = normalizarProposta(p.tipo, p.objeto);
        if (!valido) return;
        lista.push([id, {
            tipo: p.tipo,
            objeto,
            alvo: texto(p.alvo, 60),
            solicitante: texto(p.solicitante, 60),
            avisos: (Array.isArray(p.avisos) ? p.avisos : []).map(a => texto(a, 300)).filter(Boolean),
            em: Number(p.em) || 0,
        }]);
    });
    return lista.sort(([, a], [, b]) => b.em - a.em);
}

// "agora mesmo", "há 5 min", "há 2 h", "há 3 dias" (pra notificações).
export function tempoDesde(em, agora = Date.now()) {
    const ms = Number(agora) - Number(em);
    if (!Number.isFinite(ms) || ms < 60000) return 'agora mesmo';
    const min = Math.floor(ms / 60000);
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const dias = Math.floor(h / 24);
    return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

const texto = (v, max = 2000) => String(v ?? '').trim().substring(0, max);
const numero = (v, padrao, min = -Infinity, max = Infinity) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
};
const inteiro = (v, padrao, min, max) => Math.round(numero(v, padrao, min, max));
// Alcance: as telas usam parseFloat(x) || 1, então 0 (ou vazio) vira 1.
const alcance = (v) => { const n = numero(v, 1, 0, 10000); return n > 0 ? n : 1; };
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Escolhe um valor da lista (aceita maiúsculas/acentos diferentes); fora da lista -> padrão + aviso.
function escolher(valor, lista, padrao, rotulo, avisos) {
    if (valor === undefined || valor === null || valor === '') return padrao;
    const achado = lista.find(op => semAcento(op) === semAcento(valor));
    if (achado !== undefined) return achado;
    avisos.push(`${rotulo} "${valor}" não existe no sistema; usei "${padrao || 'Padrão'}".`);
    return padrao;
}

// `contadores`: [{ id, nome }] da ficha de quem recebe; `escalaContador.contadorId` pode vir como id OU como NOME do contador.
function normalizarEfeitos(lista, padraoAtributo, avisos, rotulo, contadores = []) {
    const itens = Array.isArray(lista) ? lista : [];
    if (itens.length > 12) avisos.push(`${rotulo}: só os 12 primeiros efeitos foram mantidos (${itens.length - 12} ficaram de fora).`);
    return itens.slice(0, 12).map((e, i) => {
        const avisosEfeito = [];
        const efeito = {
            nome: texto(e?.nome, 80) || `Efeito ${i + 1}`,
            atributo: escolher(e?.atributo, ATRIBUTOS_EFEITO, padraoAtributo, 'Atributo', avisosEfeito),
            propriedade: escolher(e?.propriedade, PROPRIEDADES_EFEITO, 'base', 'Propriedade', avisosEfeito),
            // O app guarda o valor como texto digitado.
            valor: String(numero(e?.valor, 0)),
        };
        // 🎲 Dado de dano (core/danoDados.js): o valor é "NdM" (campo `dado` ou `valor`), sempre na propriedade base; inválido descarta o efeito.
        if (efeito.atributo === ATRIBUTO_DANO_DADOS) {
            const dado = normalizarValorDanoDados(dadoDoEfeito(e));
            if (!dado) {
                avisos.push(`${rotulo} ${i + 1}: o dado de dano "${dadoDoEfeito(e) ?? ''}" é inválido (use NdM, ex.: 20d6, de 1 a ${LIMITES_DANO_DADOS.qtdMax} dados e faces); o efeito foi descartado.`);
                return null;
            }
            efeito.valor = dado;
            efeito.propriedade = 'base';
        }
        // Condição ("quando") e escopo (a que rolagem vale) são opcionais (core/efeitosCondicionais.js). Um que o sistema não reconhece
        // DESCARTA o efeito: deixá-lo valer sempre (ou em outra rolagem) daria a vantagem/bônus onde ele nunca deveria valer.
        const ehMult = ehPropriedadeMultiplicador(efeito.propriedade);
        const quando = ehMult ? normalizarQuandoMultiplicador(e?.quando) : normalizarQuando(e?.quando);
        const escopo = normalizarEscopo(e?.escopo, efeito.atributo);
        if (quando === null || escopo === null) {
            avisosEfeito.push(quando === null ? (ehMult ? `Multiplicador só aceita a condição em_combate ou empunhando_arma (recebeu "${e.quando}"); o efeito foi descartado.` : `Condição "${e.quando}" não existe no sistema; o efeito foi descartado.`) : (ATRIBUTOS_COM_ESCOPO_ESTADO.includes(efeito.atributo) ? `O atributo "${efeito.atributo}" precisa do escopo com o id de um estado (ou "todos"); recebi "${e.escopo ?? ''}"; o efeito foi descartado.` : `Escopo "${e.escopo}" não existe no sistema; o efeito foi descartado.`));
            avisosEfeito.forEach(a => avisos.push(`${rotulo} ${i + 1}: ${a}`));
            return null;
        }
        // Condição só vale nos atributos que a leem (ATRIBUTOS_COM_QUANDO); nos outros o efeito seria incondicional: descarta.
        if (quando && !ehMult && !ATRIBUTOS_COM_QUANDO.includes(efeito.atributo)) {
            avisosEfeito.push(`O atributo "${efeito.atributo}" ainda não aceita condição ("${quando}"); o efeito foi descartado.`);
            avisosEfeito.forEach(a => avisos.push(`${rotulo} ${i + 1}: ${a}`));
            return null;
        }
        if (quando) efeito.quando = quando;
        if (escopo) {
            if (ATRIBUTOS_COM_ESCOPO.includes(efeito.atributo) || ATRIBUTOS_COM_ESCOPO_ESTADO.includes(efeito.atributo)) efeito.escopo = escopo;
            else avisosEfeito.push(`O atributo "${efeito.atributo}" não usa escopo; ele foi ignorado.`);
        }
        // 🔢 Escala por contador (core/efeitos-resolver.js): { contadorId, fator }; fator finito, diferente de 0 e até 1.000.000. Contador inexistente = sem escala.
        const esc2 = e && e.escalaContador;
        if (esc2 && typeof esc2 === 'object' && efeito.atributo !== ATRIBUTO_DANO_DADOS) {
            const fator = Number(esc2.fator);
            const ref = String(esc2.contadorId ?? '').trim();
            const lista = Array.isArray(contadores) ? contadores : [];
            const ct = ref ? (lista.find(c => c && String(c.id) === ref) || lista.find(c => c && semAcento(c.nome) === semAcento(ref))) : null;
            if (!Number.isFinite(fator) || fator === 0 || Math.abs(fator) > 1e6) avisosEfeito.push('Escala por contador inválida (fator numérico diferente de 0); foi ignorada.');
            else if (!ct) avisosEfeito.push(`Escala por contador ignorada: não achei o contador "${ref}" na ficha (use o nome ou o id de um contador existente).`);
            else efeito.escalaContador = { contadorId: String(ct.id), fator };
        }
        // 🔢 Por aliado em campo (cena ativa): { fator, filtro? } com filtro "afiliacao|raca|classe=texto"; filtro escrito mas inválido ignora só a escala.
        const ali = e && e.escalaAliados;
        if (ali && typeof ali === 'object' && efeito.atributo !== ATRIBUTO_DANO_DADOS) {
            const fator = Number(ali.fator);
            const filtro = ali.filtro ? normalizarFiltroAliado(ali.filtro) : null;
            if (Number.isFinite(fator) && fator !== 0 && Math.abs(fator) <= 1e6 && (!ali.filtro || filtro)) efeito.escalaAliados = { fator, ...(filtro ? { filtro: filtroAliadoParaTexto(filtro) } : {}) };
            else avisosEfeito.push('Escala por aliado inválida (fator numérico diferente de 0 e filtro tipo=texto); foi ignorada.');
        }
        // 🤝 Vale também para aliados na cena ativa (core/efeitosDeAliados.js): só em atributos de ataque.
        if (e && e.valeParaAliados === true) {
            if (efeitoPodeValerParaAliados(efeito.atributo)) efeito.valeParaAliados = true;
            else avisosEfeito.push(`O atributo "${efeito.atributo}" não vale para aliados; a marca foi ignorada.`);
        }
        // 👣 Escala por movimento (core/movimentoNoTurno.js): { fator, max } com TETO `max` obrigatório (1 a 100); sem teto válido a escala é ignorada.
        const mov = e && e.escalaMovimento;
        if (mov && typeof mov === 'object') {
            const escMov = normalizarEscalaMovimento({ fator: Number(mov.fator), max: Number(mov.max) });
            if (!efeitoAceitaEscalaMovimento(efeito.atributo)) avisosEfeito.push(`O atributo "${efeito.atributo}" não escala por movimento; a escala foi ignorada.`);
            else if (!escMov || (efeito.atributo === ATRIBUTO_DANO_DADOS && escMov.fator < 0)) avisosEfeito.push(`Escala por movimento inválida (fator diferente de 0 e teto de quadrados de 1 a ${LIMITE_MAX_ESCALA_MOVIMENTO}, obrigatório); foi ignorada.`);
            else efeito.escalaMovimento = escMov;
        }
        // ☠️ Penalidade para os INIMIGOS em campo (core/efeitosDeInimigos.js): só evasiva/resistencia/acerto, valor negativo.
        if (e && e.valeParaInimigos === true) {
            if (!efeitoPodeValerParaInimigos(efeito.atributo)) avisosEfeito.push(`O atributo "${efeito.atributo}" não vale para inimigos; a marca foi ignorada.`);
            else if (efeito.propriedade !== 'base') avisosEfeito.push('Penalidade para inimigos só vale com a propriedade base; a marca foi ignorada.');
            else if (!(parseFloat(efeito.valor) < 0)) avisosEfeito.push('Penalidade para inimigos precisa de valor NEGATIVO; a marca foi ignorada.');
            else efeito.valeParaInimigos = true;
        }
        avisosEfeito.forEach(a => avisos.push(`${rotulo} ${i + 1}: ${a}`));
        return efeito;
    }).filter(Boolean);
}

// ---------- 🩸 Estados, ↩️ Reflexo e ✨ Suporte (campos opcionais das criações) ----------
// O campo só entra no objeto se o normalizado não for vazio/nulo; o que for descartado vira aviso.
function anexarEstadosReflexoSuporte(objeto, d, avisos, { reflexo = true } = {}) {
    if (Array.isArray(d.aplicaEstados) && d.aplicaEstados.length) {
        const estados = normalizarAplicaEstados(d.aplicaEstados);
        if (estados.length < d.aplicaEstados.length) avisos.push(`${d.aplicaEstados.length - estados.length} estado(s) inválido(s) ou acima do limite foram descartados.`);
        if (estados.length) objeto.aplicaEstados = estados;
    }
    if (d.reflexo !== undefined && d.reflexo !== null) {
        if (!reflexo) avisos.push('Só Poderes e Técnicas têm Reflexo; o Reflexo foi ignorado.');
        else {
            const r = normalizarReflexo(d.reflexo);
            if (r) objeto.reflexo = r;
            else avisos.push('Reflexo inválido (use o modo devolver, compartilhar ou contra); foi ignorado.');
        }
    }
    if (d.suporte !== undefined && d.suporte !== null) {
        const su = normalizarSuporte(d.suporte && typeof d.suporte === 'object' ? { ...d.suporte, buffs: buffsComQuandoCanonico(d.suporte.buffs) } : d.suporte);
        const buffsBrutos = Array.isArray(d.suporte?.buffs) ? d.suporte.buffs.length : 0;
        if (!su) avisos.push('Suporte vazio ou inválido (sem cura, escudo e buffs válidos); foi ignorado.');
        else {
            if (su.buffs.length < buffsBrutos) avisos.push(`${buffsBrutos - su.buffs.length} buff(s) de Suporte com atributo/propriedade inválido ou acima do limite foram descartados.`);
            objeto.suporte = su;
        }
    }
}

const ROTULO_ACAO_SUPORTE = { nenhuma: 'sem custo de Ação', padrao: 'Ação', bonus: 'Ação Bônus', reacao: 'Reação' };
const ROTULO_ALVOS_SUPORTE = { aliados: 'aliados', ambos: 'si e aliados' };

// Linhas curtas do que a criação aplica/devolve/cura/bufa (resumo e cartão de confirmação).
export function descreverExtrasProposta(objeto) {
    const linhas = [];
    if (!objeto) return linhas;
    (objeto.aplicaEstados || []).forEach((e) => {
        const teste = e.teste ? `teste de ${ROTULO_ATRIBUTO[e.teste.atributo] || e.teste.atributo} CD ${e.teste.cd}` : '';
        const extra = [teste, e.apenasCritico ? 'só em crítico' : '', e.duracao ? `por ${descreverDuracaoSpec(e.duracao)}` : ''].filter(Boolean).join(', ');
        linhas.push(`${iconeDoEstado(e.id)} Aplica ${nomeDoEstado(e.id)} x${e.stacks}${extra ? ` (${extra})` : ''}`);
    });
    if (objeto.reflexo) {
        const modo = { devolver: 'Devolver', compartilhar: 'Compartilhar', contra: 'Contra-golpe' }[objeto.reflexo.modo] || objeto.reflexo.modo;
        linhas.push(`↩️ Reflexo: ${modo} ${objeto.reflexo.mult}%${objeto.reflexo.automatico ? ' · automático' : ''}${objeto.reflexo.gastaReacao ? ' · gasta Reação' : ''}`);
    }
    (objeto.gatilhos || []).forEach((g) => { linhas.push(`🔔 ${g.nome}: ${descreverGatilho(g)}`); });
    if (objeto.reutilizacao) linhas.push(`🔁 ${descreverReutilizacao(objeto.reutilizacao)}`);
    const su = objeto.suporte;
    if (su) {
        const partes = [];
        if (su.cura) {
            const c = su.cura;
            const cv = [c.dadosQtd ? `${c.dadosQtd}d${c.dadosFaces}` : '', c.fixo ? String(c.fixo) : '', c.percVida ? `${c.percVida}% da Vida` : ''].filter(Boolean).join('+');
            if (cv) partes.push(`Cura ${cv}`);
            if (c.energias) partes.push(`Regenera ${Object.keys(c.energias).map(k => `${c.energias[k]}% ${k}`).join(', ')} por turno`);
        }
        if (su.escudo) partes.push(`${su.escudo.tipo === 'vidaTemporaria' ? 'Vida temporária' : 'Escudo'} ${[su.escudo.valor ? String(su.escudo.valor) : '', su.escudo.percVida ? `${su.escudo.percVida}% da Vida máx. do alvo` : ''].filter(Boolean).join('+')}`);
        if (su.buffs.length) {
            const prazo = su.duracao > 0 ? `por ${su.duracao} turno${su.duracao === 1 ? '' : 's'}` : 'sem prazo';
            partes.push(`Buffs: ${su.buffs.map(b => `${b.atributo} ${b.propriedade} ${b.valor > 0 ? '+' : ''}${b.valor}`).join(', ')} ${prazo}`);
        }
        const alvos = su.alvos === 'si' ? 'só em si' : `${ROTULO_ALVOS_SUPORTE[su.alvos]} (até ${su.maxAlvos})`;
        linhas.push(`✨ ${partes.join(' · ')} · ${alvos} · ${ROTULO_ACAO_SUPORTE[su.acao]}${su.custoPercentual ? ` · custo ${su.custoPercentual}% de ${su.energia}` : ''}`);
    }
    return linhas;
}

const ESTADOS_SCHEMA = {
    type: 'ARRAY',
    description: `Estados negativos que a criação aplica em quem for atingido (máx. ${LIMITES_ESTADOS.porFonte}). Use só quando ela deve debilitar o alvo (sangramento, queimadura, lentidão...). stacks 1-${MAX_STACKS}; "teste" deixa o alvo resistir (d20 + atributo contra a CD); apenasCritico = só em golpe crítico; duracao = turnos que o estado dura ("imobilizado por 1 turno" = "1"; aceita dado "1d12+1"; omita se não houver prazo, aí fica até remover). Ids: ${ESTADOS.map(e => e.id).join(', ')}. Ex.: [{"id":"sangrando","stacks":2,"teste":{"atributo":"constituicao","cd":15},"apenasCritico":true,"duracao":"2"}]`,
    items: {
        type: 'OBJECT',
        properties: {
            id: { type: 'STRING', enum: ESTADOS.map(e => e.id) },
            stacks: { type: 'INTEGER', description: `1 a ${MAX_STACKS}.` },
            teste: { type: 'OBJECT', description: 'Opcional: o alvo pode resistir.', properties: { atributo: { type: 'STRING', enum: ATRIBUTOS_TESTE }, cd: { type: 'INTEGER', description: `Dificuldade (1 a ${LIMITES_ESTADOS.cdMax}).` } } },
            apenasCritico: { type: 'BOOLEAN' },
            duracao: { type: 'STRING', description: 'Opcional: turnos que o estado dura (1 a 99, ex.: \"2\") ou dado (ex.: \"1d12+1\"). Sem prazo, omita.' },
        },
        required: ['id'],
    },
};

const REFLEXO_SCHEMA = {
    type: 'OBJECT',
    description: 'RARO: só para criações que devolvem/espelham o ataque recebido (barreira refletora, contra-golpe). devolver = defensor não sofre e o atacante recebe o dano; compartilhar = ambos sofrem; contra = contra-golpe com o dano original x mult. Vale só com o Poder Ativo / a Técnica Equipada. Ex.: {"modo":"devolver","mult":100,"gastaReacao":true}',
    properties: {
        modo: { type: 'STRING', enum: MODOS_REFLEXO.map(m => m.id) },
        mult: { type: 'INTEGER', description: '% do dano devolvido (10 a 1000; padrão 100, contra 150).' },
        automatico: { type: 'BOOLEAN', description: 'Dispara sozinho ao receber dano direto.' },
        gastaReacao: { type: 'BOOLEAN' },
        custoModo: { type: 'STRING', enum: ['fixo', 'igual'], description: 'fixo = custoPercentual da energia; igual = igual ao custo do ataque devolvido.' },
        comoPoder: { type: 'BOOLEAN' },
        custoPercentual: { type: 'NUMBER' },
        energia: { type: 'STRING', enum: ENERGIAS_REFLEXO },
        descricao: { type: 'STRING' },
    },
    required: ['modo'],
};

const SUPORTE_SCHEMA = {
    type: 'OBJECT',
    description: 'Cura e/ou buffs dados a quem usa e/ou a aliados (criação de apoio). Use quando a criação cura ou fortalece, não para dano. Ex.: {"cura":{"dadosQtd":3,"dadosFaces":8,"fixo":10},"buffs":[{"atributo":"forca","propriedade":"base","valor":5}],"duracao":3,"alvos":"aliados","maxAlvos":3,"acao":"padrao"}',
    properties: {
        cura: { type: 'OBJECT', description: 'Cura = dados + valor fixo + % da Vida máxima do alvo. No modo passivo, energias = % do máximo de cada energia recuperado por turno (0-100).', properties: { dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' }, fixo: { type: 'NUMBER' }, percVida: { type: 'NUMBER' }, energias: { type: 'OBJECT', properties: { mana: { type: 'NUMBER' }, aura: { type: 'NUMBER' }, chakra: { type: 'NUMBER' }, corpo: { type: 'NUMBER' } } } } },
        escudo: { type: 'OBJECT', description: 'Escudo ou Vida temporária dado a cada destinatário (só no modo uso): valor fixo + % da Vida máxima DO ALVO. Ex.: Parede de 150 = {"valor":150,"tipo":"escudo"}; Heroísmo = {"percVida":20,"tipo":"vidaTemporaria"}.', properties: { valor: { type: 'NUMBER' }, percVida: { type: 'NUMBER', description: '% da Vida máxima do alvo (0-1000).' }, tipo: { type: 'STRING', enum: ['escudo', 'vidaTemporaria'] } } },
        buffs: { type: 'ARRAY', description: 'Buffs temporários no mesmo formato dos efeitos.', items: { type: 'OBJECT', properties: { atributo: { type: 'STRING', enum: ATRIBUTOS_EFEITO }, propriedade: { type: 'STRING', enum: PROPRIEDADES_EFEITO }, valor: { type: 'NUMBER' }, dado: { type: 'STRING', description: 'Só dano_dados: o dado NdM (ex.: "20d6"); use valor 0.' }, quando: { type: 'STRING', description: 'Só dano_dados: condição (em_combate, alvo_com_debuff, combos_finalizados:<N>, primeiro_ataque_do_turno...).' } }, required: ['atributo', 'propriedade', 'valor'] } },
        modo: { type: 'STRING', enum: ['uso', 'passivo'], description: 'uso = ativo; passivo = sempre ligado enquanto o Poder/Item estiver em uso (só em quem usa).' },
        duracao: { type: 'INTEGER', description: `Turnos dos buffs (0 = sem prazo, máx. ${LIMITES_SUPORTE.duracaoMax}).` },
        alvos: { type: 'STRING', enum: MODOS_ALVO_SUPORTE.map(m => m.id), description: 'si = só quem usa; aliados; ambos.' },
        maxAlvos: { type: 'INTEGER', description: `Aliados atingidos (1 a ${LIMITES_SUPORTE.maxAlvos}).` },
        custoPercentual: { type: 'NUMBER', description: '% de energia gasta.' },
        energia: { type: 'STRING', enum: ENERGIAS_REFLEXO },
        acao: { type: 'STRING', enum: ACOES_SUPORTE.map(a => a.id), description: 'Ação gasta ao usar.' },
    },
};

export function normalizarPoder(dados, opcoesCriacao = {}) {
    const d = dados || {};
    const contadoresFicha = Array.isArray(opcoesCriacao && opcoesCriacao.contadores) ? opcoesCriacao.contadores : [];
    const avisos = [];
    const categoria = escolher(d.categoria, IDS_CATEGORIA_PODER, 'habilidade', 'Categoria', avisos);
    const vertente = escolher(d.vertente, VERTENTES_PODER, '', 'Vertente', avisos);
    const objeto = {
        nome: texto(d.nome, 120),
        descricao: texto(d.descricao),
        vertente,
        elemento: /elemental/i.test(vertente) ? texto(d.elemento, 60) : '',
        elementosAfetados: texto(d.elementosAfetados, 200),
        categoria,
        ativa: false,
        efeitos: normalizarEfeitos(d.efeitos, 'forca', avisos, 'Efeito ativo', contadoresFicha),
        efeitosPassivos: normalizarEfeitos(d.efeitosPassivos, 'evasiva', avisos, 'Efeito passivo', contadoresFicha),
        imagemUrl: '',
        dadosQtd: inteiro(d.dadosQtd, 0, 0, 1000),
        dadosFaces: inteiro(d.dadosFaces, 20, 1, 1000),
        custoPercentual: numero(d.custoPercentual, 0, 0, 100),
        alcance: alcance(d.alcance),
        area: numero(d.area, 0, 0, 10000),
        armaVinculada: '',
        pasta: normalizarPasta(texto(d.pasta, 120)),
        tipoAcao: normalizarTipoAcao(d.tipoAcao),
        notasIA: texto(d.notasIA, 4000),
    };
    // 🧮 Dados extras (outros tipos de dado rolados junto) e fatores N x atributo (SÓ no dano): validação rígida, o inválido sai com aviso (core/danoDados.js).
    const extras = normalizarDadosExtra(d.dadosExtra);
    const brutosExtras = Array.isArray(d.dadosExtra) ? d.dadosExtra.length : 0;
    if (brutosExtras > extras.lista.length) avisos.push(`${brutosExtras - extras.lista.length} dado(s) extra(s) inválido(s) (use qtd e faces inteiros, de 1 a ${LIMITES_DANO_DADOS.qtdMax}) ou acima do limite de ${LIMITES_DANO_DADOS.gruposExtra} tipos foram descartados.`);
    if (d.dadosExtra !== undefined && d.dadosExtra !== null && !Array.isArray(d.dadosExtra)) avisos.push('dadosExtra precisa ser uma lista de { qtd, faces }; foi ignorado.');
    let listaExtras = extras.lista;
    if (objeto.dadosQtd === 0 && listaExtras.length > 0) { objeto.dadosQtd = listaExtras[0].qtd; objeto.dadosFaces = listaExtras[0].faces; listaExtras = listaExtras.slice(1); }
    if (listaExtras.length > 0) objeto.dadosExtra = listaExtras;
    if (d.statusFatores !== undefined && d.statusFatores !== null) {
        const fat = normalizarStatusFatores(fatoresComApelidos(d.statusFatores));
        if (fat.descartados > 0) avisos.push(`${fat.descartados} fator(es) de atributo inválido(s) (atributo desconhecido, N <= 0 ou acima de ${LIMITES_DANO_DADOS.fatorMax}) foram descartados.`);
        if (Object.keys(fat.fatores).length > 0) objeto.statusFatores = fat.fatores;
    }
    if (categoria === 'forma') {
        objeto.maestria = numero(d.maestria, 0, 0, 100);
        objeto.fadigaPorUso = numero(d.fadigaPorUso, 15, 0, 100);
    } else {
        objeto.maestria = numero(d.maestria, 0, 0, 100);
        objeto.maestriaRequerida = numero(d.maestriaRequerida, 0, 0, 100);
    }
    // 🧬 Habilidade de Raça: quem tem acesso (racasAcesso) NUNCA vem da IA nem do jogador: nasce vazia e só o Mestre define (core/racas.js).
    if (categoria === 'habilidadeRaca') objeto.racasAcesso = [];
    // 🔁 Usos limitados (core/usosPoder.js): só grava quando há limite (usosMax > 0).
    const usos = normalizarUsos(d.usosMax, d.usosPor);
    if (usos) { objeto.usosMax = usos.max; objeto.usosPor = usos.por; }
    // 🔋 Custo por turno enquanto ligado (core/custoPorTurno.js): inválido é ignorado com aviso; sem custo não grava nada.
    const custoTurno = lerCustosPorTurno(d.custoPorTurno);
    if (custoTurno.custos.length) objeto.custoPorTurno = custoPorTurnoParaSalvar(d.custoPorTurno);
    if (custoTurno.aviso) avisos.push(custoTurno.aviso);
    // 💥 Cobra o custo por turno também ao ligar (só faz sentido com custo por turno).
    if (custoTurno.custos.length && d.cobrarAoAtivar === true) objeto.cobrarAoAtivar = true;
    // ⏳ Recarga em turnos (core/recargaPoder.js): inteiro 1 a 99; 0/ausente não grava.
    const recarga = normalizarRecarga(d.recargaTurnos);
    if (recarga > 0) objeto.recargaTurnos = recarga;
    if (Number(d.recargaTurnos) > LIMITE_RECARGA) avisos.push(`Recarga acima de ${LIMITE_RECARGA} turnos: reduzida para ${LIMITE_RECARGA}.`);
    // 🔁 Reutilização do golpe (core/reutilizacao.js): por nº de alvos OU por chance; inválido não grava nada (nunca "meio reuso") e avisa.
    if (d.reutilizacao !== undefined && d.reutilizacao !== null) {
        const reut = normalizarReutilizacao(d.reutilizacao);
        if (reut) objeto.reutilizacao = reut;
        else avisos.push(`Reutilização inválida (use {"porAlvos":{"1":N,"2":M}} com N até ${LIMITE_REUSOS}, ou {"chance":%,"max":N,"extra":"NdM"}); foi ignorada.`);
    }
    // 💀 Dano Verdadeiro (core/reducaoDano.js): só o boolean true (ou "true") marca o Poder; qualquer outra coisa não grava nada.
    if (d.danoVerdadeiro === true || d.danoVerdadeiro === 'true') objeto.danoVerdadeiro = true;
    // 🛡️ Escudo que o Poder cria ao ligar (core/escudos.js); inválido não grava nada.
    const escudoLigar = normalizarEscudoAoLigar(d.escudoAoLigar);
    if (escudoLigar) objeto.escudoAoLigar = escudoLigar;
    else if (d.escudoAoLigar) avisos.push('Escudo ao ligar ignorado: precisa de nome e valor maior que 0.');
    // 💥 Efeito ao desligar à mão (core/aoDesligar.js): dados de dano em si; inválido é ignorado com aviso.
    if (d.aoDesligar !== undefined && d.aoDesligar !== null && d.aoDesligar !== '') {
        const aoDesligar = normalizarAoDesligar(d.aoDesligar);
        if (aoDesligar) objeto.aoDesligar = aoDesligar; else avisos.push('Efeito ao desligar ignorado: precisa de dadosQtd e dadosFaces maiores que zero.');
    }
    // 💚 Ao acertar (core/aoAcertar.js): cura/energia de quem acertou; só grava o que for válido.
    const aoAcertar = normalizarAoAcertar(d.aoAcertar);
    if (aoAcertar.length > 0) objeto.aoAcertar = aoAcertar;
    // 🔔 Gatilhos (core/gatilhos.js): validados por normalizarGatilhos; a IA nunca decide o modo, então chegam OPCIONAIS e DESARMADOS
    // (o dono arma no Poder). O que for inválido ou passar dos limites vira aviso, nunca "meio gatilho".
    if (d.gatilhos !== undefined && d.gatilhos !== null && d.gatilhos !== '') {
        const lidos = lerGatilhosDaIA(d.gatilhos);
        if (lidos.gatilhos.length > 0) {
            objeto.gatilhos = lidos.gatilhos;
            avisos.push(`${lidos.gatilhos.length} gatilho(s) chegam OPCIONAIS e DESARMADOS: o dono arma no Poder (ou muda para automático) depois de conferir.`);
        }
        lidos.naoAplicado.forEach(a => avisos.push(a));
        lidos.avisos.forEach(a => avisos.push(a));
    }
    anexarEstadosReflexoSuporte(objeto, d, avisos);
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

export function normalizarMagia(dados) {
    const d = dados || {};
    const avisos = [];
    const tipoMecanica = escolher(d.tipoMecanica, TIPOS_MECANICA_MAGIA, 'ataque', 'Mecânica', avisos);
    const objeto = {
        nome: texto(d.nome, 120),
        descricao: texto(d.descricao),
        elemento: texto(d.elemento, 60) || 'Neutro',
        elementosAfetados: texto(d.elementosAfetados, 200),
        bonusTipo: escolher(d.bonusTipo, BONUS_MAGIA, 'nenhum', 'Bônus', avisos),
        bonusValor: String(numero(d.bonusValor, 0)),
        custoValor: numero(d.custoValor, 0, 0, 1e15),
        dadosExtraQtd: inteiro(d.dadosExtraQtd, 0, 0, 1000),
        dadosExtraFaces: inteiro(d.dadosExtraFaces, 20, 1, 1000),
        energiaCombustao: escolher(d.energiaCombustao, ENERGIAS_COMBUSTAO, 'flexivel', 'Energia', avisos),
        tipoMecanica,
        savingAttr: escolher(d.savingAttr, ATRIBUTOS_SAVING, 'destreza', 'Atributo de resistência', avisos),
        alcanceQuad: alcance(d.alcanceQuad),
        areaQuad: numero(d.areaQuad, 0, 0, 10000),
        alvosAfetados: escolher(d.alvosAfetados, ALVOS_MAGIA, 'todos', 'Alvos', avisos),
        duracaoZona: inteiro(d.duracaoZona, 0, 0, 1000),
        equipado: false,
    };
    // Acerta maiúsculas/acentos de um elemento conhecido; desconhecido só gera aviso.
    const conhecido = ELEMENTOS_CONHECIDOS.find(e => semAcento(e) === semAcento(objeto.elemento));
    if (conhecido) objeto.elemento = conhecido;
    else if (!/^Elemento |Magia|Truque/i.test(objeto.elemento)) avisos.push(`Elemento "${objeto.elemento}" não tem aba própria nas Técnicas Elementais (vai para "Pergaminhos Perdidos").`);
    // 🎲 Limite de dados do nível do elemento (core/limiteDados.js): a Sexta-Feira não propõe dados acima dele.
    const dadosLimitados = dadosLimitadosDaTecnica(objeto, objeto.dadosExtraQtd, objeto.dadosExtraFaces);
    if (dadosLimitados.limitado) {
        avisos.push(`Dados acima do limite do elemento (${dadosLimitados.limite} de dano): reduzidos de ${objeto.dadosExtraQtd}d${objeto.dadosExtraFaces} para ${dadosLimitados.qtd}d${dadosLimitados.faces}.`);
        objeto.dadosExtraQtd = dadosLimitados.qtd;
    }
    anexarEstadosReflexoSuporte(objeto, d, avisos);
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

export function normalizarItem(dados) {
    const d = dados || {};
    const avisos = [];
    const tipo = escolher(d.tipo, TIPOS_ITEM, 'arma', 'Tipo', avisos);
    const arma = tipo === 'arma';
    const objeto = {
        nome: texto(d.nome, 120),
        tipo,
        elemento: 'Neutro',
        bonusTipo: escolher(d.bonusTipo, BONUS_ITEM, 'mult_dano', 'Bônus', avisos),
        bonusValor: String(numero(d.bonusValor, 0)),
        armaTipo: arma ? escolher(d.armaTipo, TIPOS_ARMA, 'espada', 'Tipo de arma', avisos) : '',
        raridade: escolher(d.raridade, RARIDADES_ITEM, 'comum', 'Raridade', avisos),
        dadosQtd: arma ? inteiro(d.dadosQtd, 1, 1, 1000) : 0,
        dadosFaces: arma ? inteiro(d.dadosFaces, 20, 1, 1000) : 0,
        alcance: arma ? alcance(d.alcance) : 0,
        // Qualquer tipo de item guarda efeitos: os ATIVOS só valem com o toggle ligado, os PASSIVOS sempre que equipado.
        efeitos: normalizarEfeitos(d.efeitos, 'forca', avisos, 'Efeito ativo'),
        efeitosPassivos: normalizarEfeitos(d.efeitosPassivos, 'evasiva', avisos, 'Efeito passivo'),
        equipado: false,
    };
    anexarEstadosReflexoSuporte(objeto, d, avisos, { reflexo: false });
    if (!objeto.nome) avisos.push('Falta o nome.');
    return { objeto, avisos, valido: !!objeto.nome };
}

// NPC/dummie do Mapa. `vida` vem na escala EXIBIDA (a mesma que o Mestre digita no Mapa).
export function normalizarNpc(dados) {
    const d = dados || {};
    const avisos = [];
    const vidaExibida = numero(d.vida, 100, 1, 1e15);
    const hp = Math.round(vidaExibida * FATOR_EXIBICAO_VITAIS);
    const objeto = {
        nome: texto(d.nome, 60) || 'Entidade',
        hpMax: hp,
        hpAtual: hp,
        tipoDefesa: escolher(d.tipoDefesa, DEFESAS_NPC, 'evasiva', 'Defesa', avisos),
        valorDefesa: numero(d.valorDefesa, 10, 0, 1e6),
        visibilidadeHp: escolher(d.visibilidadeHp, VISIBILIDADES_HP, 'todos', 'Visibilidade', avisos),
    };
    // ⚡ Poder Calculado (Disputa de Poder, core/disputaPoder.js). Sem valor = sem disputa.
    const poder = numero(d.poder, null, 0, 1e300);
    if (poder !== null) objeto.poderCalculado = poder;
    const quantidade = inteiro(d.quantidade, 1, 1, 10);
    return { objeto, avisos, valido: true, quantidade };
}

export function normalizarTierList(dados, nomesConhecidos = []) {
    const avisos = [];
    const itens = (Array.isArray(dados?.ranks) ? dados.ranks : []).slice(0, 60);
    const vistos = new Set();
    const ranks = [];
    itens.forEach((r) => {
        const nome = texto(r?.nome, 80);
        if (!nome || vistos.has(nome)) return;
        const rank = IDS_RANKS.find(id => id === String(r?.rank || '').trim().toUpperCase());
        if (!rank) { avisos.push(`Rank "${r?.rank}" de ${nome} não existe; ignorado.`); return; }
        vistos.add(nome);
        ranks.push({ nome, rank });
    });
    const desconhecidos = ranks.filter(r => nomesConhecidos.length && !nomesConhecidos.includes(r.nome)).map(r => r.nome);
    if (desconhecidos.length) avisos.push(`Sem ficha/avatar na mesa: ${desconhecidos.join(', ')} (entram como entidade manual).`);
    return { objeto: { ranks }, avisos, valido: ranks.length > 0 };
}


// ---------- 🥋 Combos e Follow Ups (core/combos.js) ----------
// Buff de dano_dados com "quando": a condição entra na forma canônica; inválida descarta o buff (falha fechada, conta no aviso de descartados). Os demais passam como vieram.
function buffsComQuandoCanonico(lista) {
    return (Array.isArray(lista) ? lista : []).map((b) => {
        if (!b || typeof b !== 'object' || b.atributo !== ATRIBUTO_DANO_DADOS || b.quando === undefined || b.quando === null || b.quando === '') return b;
        const q = normalizarQuando(b.quando);
        return q === null ? null : { ...b, quando: q };
    });
}
const golpeComQuandoCanonico = (g) => (g && typeof g === 'object' ? { ...g, buffs: buffsComQuandoCanonico(g.buffs) } : g);
function contarBuffs(golpes) { return golpes.reduce((s, g) => s + (Array.isArray(g?.buffs) ? g.buffs.length : 0), 0); }

export function normalizarComboProposta(dados) {
    const avisos = [];
    const entrada = dados && typeof dados === 'object' ? dados : {};
    const brutoGolpes = [entrada.iniciador, ...(Array.isArray(entrada.passos) ? entrada.passos : [])];
    const combo = normalizarCombo({ ...entrada, id: undefined, iniciador: golpeComQuandoCanonico(entrada.iniciador), passos: (Array.isArray(entrada.passos) ? entrada.passos : []).map(golpeComQuandoCanonico) });
    const antes = contarBuffs(brutoGolpes);
    const depois = contarBuffs([combo.iniciador, ...combo.passos]);
    if (depois < antes) avisos.push(`${antes - depois} buff(s) inválido(s) ou acima do limite foram descartados.`);
    if ((Array.isArray(entrada.passos) ? entrada.passos.length : 0) > combo.passos.length) avisos.push(`O Combo aceita até ${LIMITES_COMBO.passos} golpes depois do iniciador; o resto foi cortado.`);
    const { id, ...objeto } = combo;
    const valido = !!(objeto.nome && objeto.iniciador.nome && objeto.passos.length > 0 && objeto.passos.every(p => p.nome));
    if (!valido) avisos.push('Um Combo precisa de nome, de um iniciador com nome e de ao menos um golpe com nome depois dele.');
    return { objeto, avisos, valido };
}

export function normalizarFollowUpProposta(dados) {
    const avisos = [];
    const entrada = dados && typeof dados === 'object' ? dados : {};
    const fu = normalizarFollowUp({ ...entrada, id: undefined, combosIds: [], niveis: (Array.isArray(entrada.niveis) ? entrada.niveis : []).map(golpeComQuandoCanonico) });
    const antes = (Array.isArray(entrada.niveis) ? entrada.niveis : []).reduce((s, n) => s + (Array.isArray(n?.buffs) ? n.buffs.length : 0), 0);
    const depois = fu.niveis.reduce((s, n) => s + n.buffs.length, 0);
    if (depois < antes) avisos.push(`${antes - depois} buff(s) inválido(s) ou acima do limite foram descartados.`);
    const { id, ...objeto } = fu;
    return { objeto, avisos, valido: !!objeto.nome };
}

const SCHEMA_GOLPE = {
    nome: { type: 'STRING' },
    tipo: { type: 'STRING', enum: TIPOS_GOLPE.map(t => t.id), description: 'livre = golpe sem vínculo; arma; habilidade; tecnica (Técnica Elemental); magia.' },
    acao: { type: 'STRING', enum: ACOES_GOLPE.map(a => a.id), description: 'Ação gasta pelo golpe: padrao (Ação), bonus (Ação Bônus) ou reacao.' },
    descricao: { type: 'STRING' },
};

export function normalizarProposta(tipo, dados, extras = {}) {
    switch (tipo) {
        case 'combo': return normalizarComboProposta(dados);
        case 'followup': return normalizarFollowUpProposta(dados);
        case 'poder': return normalizarPoder(dados, extras);
        case 'magia': return normalizarMagia(dados);
        case 'item': return normalizarItem(dados);
        case 'npc': return normalizarNpc(dados);
        case 'tierlist': return normalizarTierList(dados, extras.nomesConhecidos);
        default: return { objeto: null, avisos: [`Tipo desconhecido: ${tipo}`], valido: false };
    }
}

// ⚖️ Comparação com o que o personagem já tem: avisa se ficou muito acima (ou barato demais).
export function avaliarEquilibrio(tipo, objeto, fichaAlvo) {
    const avisos = [];
    if (!objeto || !fichaAlvo) return avisos;
    const lista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(Boolean);
    const dadosMedios = (qtd, faces) => (Number(qtd) || 0) * ((Number(faces) || 0) + 1) / 2;
    if (tipo === 'poder' || tipo === 'item') {
        const existentes = lista(tipo === 'poder' ? fichaAlvo.poderes : fichaAlvo.inventario)
            .map(p => dadosMedios(p.dadosQtd, p.dadosFaces)).filter(v => v > 0);
        const novo = dadosMedios(objeto.dadosQtd, objeto.dadosFaces);
        if (novo > 0 && existentes.length) {
            const maior = Math.max(...existentes);
            if (novo > maior * 1.5) avisos.push(`Dano médio ${novo.toFixed(1)} vs. o maior atual ${maior.toFixed(1)}: bem mais forte que o que o personagem já tem.`);
        }
        const efeitosGrandes = [...(objeto.efeitos || []), ...(objeto.efeitosPassivos || [])]
            .filter(e => ['mgeral', 'mabs', 'munico', 'mbase', 'mformas'].includes(e.propriedade) && Number(e.valor) >= 2);
        if (efeitosGrandes.length) avisos.push('Tem multiplicador de 2x ou mais: impacto grande no Poder Calculado.');
    }
    // Categoria especial ainda não liberada na Hierarquia da Alma: grava mesmo assim (o Mestre pode liberar depois), mas avisa.
    if (tipo === 'poder' && objeto.categoria && !categoriaLiberadaNaFicha(objeto.categoria, fichaAlvo)) {
        avisos.push(`Categoria ${objeto.categoria} não liberada para este personagem (Ficha > pág. 4 dos Marcados): o poder será gravado mesmo assim; libere a categoria na Hierarquia da Alma.`);
    }
    if (tipo === 'poder' && objeto.categoria !== 'forma' && objeto.dadosQtd > 0 && !objeto.custoPercentual) {
        avisos.push('Causa dano sem custo de energia.');
    }
    if (tipo === 'magia') {
        const existentes = lista(fichaAlvo.ataquesElementais).map(m => dadosMedios(m.dadosExtraQtd, m.dadosExtraFaces)).filter(v => v > 0);
        const novo = dadosMedios(objeto.dadosExtraQtd, objeto.dadosExtraFaces);
        if (novo > 0 && existentes.length && novo > Math.max(...existentes) * 1.5) avisos.push('Dados extras bem acima das outras Técnicas do personagem.');
        if (!objeto.custoValor && objeto.tipoMecanica === 'ataque') avisos.push('Técnica de ataque sem custo.');
    }
    return avisos;
}

// Anexa um item novo a uma lista da ficha que pode ter vindo do banco como objeto ({0:..,1:..}).
export function anexarNaLista(atual, objeto) {
    const base = Array.isArray(atual) ? atual : (atual && typeof atual === 'object' ? Object.values(atual) : []);
    return [...base.filter(Boolean), objeto];
}

// Resumo curto pra cartões e pra lista de pendências do Mestre.
export function resumirProposta(tipo, objeto, { extras: comExtras = true } = {}) {
    const base = resumirBase(tipo, objeto);
    if (!comExtras) return base;
    const extras = descreverExtrasProposta(objeto);
    return extras.length ? `${base} · ${extras.join(' · ')}` : base;
}

function resumirBase(tipo, objeto) {
    if (!objeto) return '';
    if (tipo === 'poder') return `${objeto.categoria} · ${resumirFormulaDeDano(objeto) || 'sem dano'} · custo ${objeto.custoPercentual}% · ${(objeto.efeitos || []).length + (objeto.efeitosPassivos || []).length} efeito(s)`;
    if (tipo === 'magia') return `${objeto.elemento} · ${objeto.tipoMecanica} · ${objeto.dadosExtraQtd ? `${objeto.dadosExtraQtd}d${objeto.dadosExtraFaces}` : 'sem dados extras'} · custo ${objeto.custoValor}`;
    if (tipo === 'item') return `${objeto.tipo}${objeto.armaTipo ? ` (${objeto.armaTipo})` : ''} · ${objeto.raridade}${objeto.dadosQtd ? ` · ${objeto.dadosQtd}d${objeto.dadosFaces}` : ''}`;
    if (tipo === 'npc') return `Vida ${Math.round(objeto.hpMax / FATOR_EXIBICAO_VITAIS).toLocaleString('pt-BR')} · ${objeto.tipoDefesa} ${objeto.valorDefesa}${objeto.poderCalculado !== undefined ? ` · Poder ${Math.round(objeto.poderCalculado).toLocaleString('pt-BR')}` : ''}`;
    if (tipo === 'tierlist') return `${(objeto.ranks || []).length} personagem(ns) classificados`;
    if (tipo === 'combo') return `${resumirCombo(objeto)} · ${objeto.passos.length + 1} golpes`;
    if (tipo === 'followup') return `${objeto.niveis.length} nível(is) · ${objeto.acoesPermitidas.map(a => (ACOES_GOLPE.find(x => x.id === a) || {}).rotulo).join('/')} · ${objeto.quando === 'combo' ? 'durante um Combo' : 'a qualquer momento'}`;
    return '';
}

// ---------- Declarações das ferramentas de criação (formato do Gemini) ----------
const EFEITOS_SCHEMA = {
    type: 'ARRAY',
    description: 'Efeitos numéricos: atributo + propriedade + valor.',
    items: {
        type: 'OBJECT',
        properties: {
            nome: { type: 'STRING' },
            atributo: { type: 'STRING', enum: ATRIBUTOS_EFEITO },
            propriedade: { type: 'STRING', enum: PROPRIEDADES_EFEITO, description: 'base = soma fixa; mbase/mgeral/mformas/mabs/munico = multiplicadores; reducaocusto; regeneracao; bonus_acerto; elemento_inato; furia_berserker.' },
            valor: { type: 'NUMBER', description: 'Número do efeito. Para o atributo dano_dados use valor 0 e preencha "dado".' },
            dado: { type: 'STRING', description: 'SÓ para atributo dano_dados (bônus de DADO no dano rolado do golpe; propriedade base): o dado no formato NdM, ex.: "20d6". Multiplicadores x N continuam só no Poder: não use dano_dados para eles.' },
            quando: { type: 'STRING', description: 'Opcional: condição para o efeito valer. sempre (padrão), em_combate, empunhando_arma, empunhando_arma:<tipo, ex.: espada>, alvo_com_estado:<id do estado, ex.: surpreso>, alvo_vida_abaixo:<%>, alvo_com_debuff (alvo com algum estado negativo), combos_finalizados:<N> (o portador finalizou ao menos N Combos), primeiro_ataque_do_turno, aliados_em_campo:<N>[:afiliacao=texto|raca=texto|classe=texto] (ao menos N aliados na cena ativa).' },
            escopo: { type: 'STRING', description: 'Opcional, para vantagem/desvantagem/piso_d20: ataque, teste, teste:<perícia ou atributo, ex.: intuicao> ou tudo.' },
            escalaContador: { type: 'OBJECT', description: 'Opcional: o efeito ganha fator x o valor de um contador EXISTENTE da ficha (soma: valor + fator x contador).', properties: { contadorId: { type: 'STRING' }, fator: { type: 'NUMBER' } } },
            escalaAliados: { type: 'OBJECT', description: 'Opcional: o efeito ganha fator x o número de aliados na CENA ATIVA (soma). filtro opcional "afiliacao=texto", "raca=texto" ou "classe=texto".', properties: { fator: { type: 'NUMBER' }, filtro: { type: 'STRING' } } },
            escalaMovimento: { type: 'OBJECT', description: 'Opcional: o efeito ganha fator x quadrados percorridos no turno (só em combate), COM teto obrigatório de quadrados contados (1 a 100). Em dano_dados o dado do efeito vale POR quadrado. Atributos: dano_dados, acerto, evasiva, resistencia, dano.', properties: { fator: { type: 'NUMBER' }, max: { type: 'NUMBER' } } },
            valeParaInimigos: { type: 'BOOLEAN', description: 'Opcional: true para o efeito ser PENALIDADE (valor negativo) dos inimigos do portador na cena ativa (só evasiva, resistencia, acerto). Combine com quando estado_em_campo:<id do estado, ex.: presa>.' },
            valeParaAliados: { type: 'BOOLEAN', description: 'Opcional: true para o efeito valer também para os aliados na cena ativa (só atributos de ataque: acerto, vantagem, margem_critico, dano_dados...).' },
        },
        required: ['atributo', 'propriedade', 'valor'],
    },
};
const ALVO_SCHEMA = { type: 'STRING', description: 'Personagem que recebe (vazio = quem está pedindo). Jogadores só podem pedir para si.' };

// Gatilhos (core/gatilhos.js): o schema espelha o vocabulário REAL; o que não fechar é descartado por normalizarGatilhos.
const PROPS_ACAO_GATILHO = {
    tipo: { type: 'STRING', enum: ACOES_GATILHO.map(a => a.id) },
    modo: { type: 'STRING', description: 'curar/danoEmSi: fixo | percMax | percAtual. danoNoAtacante: percDanoRecebido | fixo. buff: turnos | combate | permanente. ganhoPermanente: somar (linear) | multiplicar (composto: multiplica o Poder atual por 1+%/100); sempre junto de unidade:"percentual" (sem modo nem unidade o valor é bruto, formato antigo).' },
    valor: { type: 'NUMBER' }, percMax: { type: 'NUMBER', description: 'definirVida: % da Vida máxima (use valor OU percMax).' },
    nome: { type: 'STRING' }, tipoEscudo: { type: 'STRING', enum: ['escudo', 'vidaTemporaria'] },
    atributo: { type: 'STRING', description: 'buff: atributo do efeito.' }, duracao: { type: 'INTEGER', description: 'buff: turnos (1 a 20). aplicarEstado: turnos que o estado dura (1 a 99), omita se for até remover.' },
    duracaoTurnos: { type: 'INTEGER', description: 'imunidadeTotal: turnos (1 a 10).' }, texto: { type: 'STRING', description: 'mensagem.' },
    id: { type: 'STRING', description: 'contador: id do contador existente na ficha.' }, op: { type: 'STRING', enum: OPS_CONTADOR_ACAO }, sorteio: { type: 'STRING', description: 'contador: "NdM".' },
    estado: { type: 'STRING', description: `aplicarEstado/removerEstado. Ids: ${ESTADOS.map(e => e.id).join(', ')}.` }, stacks: { type: 'INTEGER' },
    poderId: { type: 'STRING', description: 'ligarPoder/desligarPoder.' },
    followUpId: { type: 'STRING', description: 'oferecerFollowUp: id OU nome de um Follow Up que já existe na ficha (FUA oferecido: o jogador aceita ou recusa e rola o golpe; a ação nunca ataca sozinha).' },
    custoReducaoPct: { type: 'NUMBER', description: 'oferecerFollowUp: redução (%) do custo de energia do golpe oferecido (0 a 100; 100 = sem custo). Omita se não houver.' },
    semCusto: { type: 'BOOLEAN', description: 'oferecerFollowUp: true = o golpe não gasta energia (o mesmo que custoReducaoPct 100).' },
    naoGeraOutro: { type: 'BOOLEAN', description: 'oferecerFollowUp: true = o golpe oferecido não gera outro Follow Up.' },
    duracaoGanho: { type: 'STRING', enum: ['permanente', 'combate'], description: 'ganhoPermanente: "combate" quando o texto disser durante o combate / até o fim da luta / temporário (zera no fim da luta); senão "permanente" (ou omita).' },
    unidade: { type: 'STRING', enum: ['percentual', 'bruto'], description: 'ganhoPermanente: use "percentual" (valor = % de Poder, ex.: +2% = 2); "bruto" só para o formato antigo.' }, deContador: { type: 'OBJECT', description: 'ganhoPermanente a partir de um contador: ganho no Poder Calculado = valor atual do contador x fator, em % quando unidade percentual (use isto OU valor).', properties: { id: { type: 'STRING', description: 'nome do contador' }, fator: { type: 'NUMBER' }, zerar: { type: 'BOOLEAN', description: 'zerar o contador depois' } } },
};
const GATILHOS_SCHEMA = {
    type: 'ARRAY',
    description: `Regras "quando X, faça Y" (até ${LIMITE_GATILHOS_POR_FONTE}). Chegam OPCIONAIS e DESARMADOS (você NÃO decide modo nem armado). Eventos: ${EVENTOS_GATILHO.map(e => e.id).join(', ')}. anularDano só em danoQueZeraria. Limite por turno | cena | descanso ("1 vez por combate" = cena; "luta" não existe). Ex.: [{"nome":"Volta das cinzas","evento":{"tipo":"danoQueZeraria"},"limite":{"max":1,"por":"cena"},"acoes":[{"tipo":"definirVida","valor":1},{"tipo":"imunidadeTotal","duracaoTurnos":1}]}]`,
    items: {
        type: 'OBJECT',
        properties: {
            nome: { type: 'STRING' }, notas: { type: 'STRING' },
            evento: { type: 'OBJECT', properties: { tipo: { type: 'STRING', enum: EVENTOS_GATILHO.map(e => e.id) }, de: { type: 'NUMBER', description: 'vidaAbaixoDe: % maior da faixa.' }, ate: { type: 'NUMBER', description: 'vidaAbaixoDe: % menor da faixa.' }, nivel: { type: 'STRING', enum: NIVEIS_ACERTO, description: 'acertou/atingido.' }, poderId: { type: 'STRING', description: 'poderLigou/poderDesligou (vazio = este Poder; "qualquer").' }, contadorId: { type: 'STRING' }, op: { type: 'STRING', enum: OPS_CONTADOR_EVENTO }, valor: { type: 'NUMBER' }, armaTipo: { type: 'STRING', description: 'armaTrocada: tipo da arma equipada (ex.: espada, arco); vazio = qualquer arma.' } }, required: ['tipo'] },
            condicoes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'vida_maior_que:N, vida_menor_que:N, em_combate, empunhando_arma[:tipo], alvo_com_estado:<id>, eu_com_estado:<id> (o próprio portador), alvo_vida_abaixo:<%>, alvo_com_debuff, combos_finalizados:<N>, primeiro_ataque_do_turno, aliados_em_campo:<N>[:afiliacao=texto|raca=texto|classe=texto].' },
            limite: { type: 'OBJECT', properties: { max: { type: 'INTEGER' }, por: { type: 'STRING', enum: PERIODOS_GATILHO.map(p => p.id) } } },
            acoes: {
                type: 'ARRAY', description: `Até ${LIMITE_ACOES_POR_GATILHO} ações. rolarTabela: {"tipo":"rolarTabela","dado":"1d6","resultados":[{"ate":3,"texto":"...","acoes":[...]}]} (até ${LIMITE_LINHAS_TABELA} faixas, "ate" crescente). pedirEscolha: {"tipo":"pedirEscolha","pergunta":"...","opcoes":[{"texto":"...","acoes":[...]}]} (2 a ${LIMITE_OPCOES_ESCOLHA} opções).`,
                items: { type: 'OBJECT', properties: { ...PROPS_ACAO_GATILHO, dado: { type: 'STRING', description: 'rolarTabela: "NdM".' }, resultados: { type: 'ARRAY', items: { type: 'OBJECT', properties: { ate: { type: 'INTEGER' }, texto: { type: 'STRING' }, acoes: { type: 'ARRAY', items: { type: 'OBJECT', properties: PROPS_ACAO_GATILHO, required: ['tipo'] } } } } }, pergunta: { type: 'STRING', description: 'pedirEscolha: a pergunta.' }, opcoes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { texto: { type: 'STRING' }, acoes: { type: 'ARRAY', items: { type: 'OBJECT', properties: PROPS_ACAO_GATILHO, required: ['tipo'] } } } } } }, required: ['tipo'] },
            },
        },
        required: ['nome', 'evento', 'acoes'],
    },
};

export const DECLARACOES_CRIACAO = [
    {
        name: 'propor_habilidade',
        description: 'Prepara uma Habilidade, Poder ou Forma no formato do Grimório. NÃO grava: vira um cartão para o Mestre aplicar (ou o jogador mandar para aprovação).',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                categoria: { type: 'STRING', enum: IDS_CATEGORIA_PODER, description: 'habilidade, forma ou poder; ocular = Poderes Oculares (olhos/dojutsu: Sharingan, Rinnegan, Byakugan); infinity = manipulação conceitual absoluta; singularidade = anomalia máxima irrepetível (impossível de copiar); habilidadeRaca = Habilidade de Raça (depende da Raça do personagem; só o Mestre concede). Só use ocular/infinity/singularidade/habilidadeRaca se o pedido deixar claro.' },
                nome: { type: 'STRING' },
                descricao: { type: 'STRING' },
                vertente: { type: 'STRING', enum: VERTENTES_PODER.filter(Boolean), description: 'Vazio = Padrão. Use Elemental para ter elemento.' },
                elemento: { type: 'STRING', description: 'Só com vertente Elemental. Ex.: Fogo, Raio, Gelo, Luz, Trevas.' },
                elementosAfetados: { type: 'STRING' },
                dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' },
                dadosExtra: { type: 'ARRAY', description: 'Outros tipos de dado rolados JUNTO com dadosQtd/dadosFaces (ex.: "100d4+25d10" = dadosQtd 100, dadosFaces 4, dadosExtra [{"qtd":25,"faces":10}]). Omita se houver só um tipo de dado.', items: { type: 'OBJECT', properties: { qtd: { type: 'INTEGER' }, faces: { type: 'INTEGER' } }, required: ['qtd', 'faces'] } },
                statusFatores: { type: 'OBJECT', description: 'N x o valor EXIBIDO do atributo, SÓ no dano ("3*dex+3*PM" = {"destreza":3,"inteligencia":3}). Chaves: forca, destreza, inteligencia, sabedoria, energiaEsp, carisma, stamina, constituicao. Termos que você não sabe mapear (ex.: "att"): NÃO invente, deixe em notasIA.' },
                custoPercentual: { type: 'NUMBER', description: '% de energia gasta ao usar.' },
                alcance: { type: 'NUMBER' }, area: { type: 'NUMBER' },
                tipoAcao: { type: 'STRING', enum: ['acao', 'bonus', 'reacao', 'movimento', 'livre'], description: 'Ação gasta ao usar (vazio = automático).' },
                notasIA: { type: 'STRING', description: 'Regras que não cabem nos campos (condições, usos, gatilhos), em frases curtas.' },
                aoAcertar: { type: 'ARRAY', description: 'O que acontece quando o golpe atinge e causa Dano (até 6): em QUEM ACERTOU (curarAtacante, energiaAtacante) ou no ALVO personagem (drenarEnergiaAlvo; debuffAlvo = reduz Evasiva/Resistência/Acerto do alvo por alguns turnos dele). Ex.: [{"tipo":"curarAtacante","modo":"percMax","valor":5},{"tipo":"debuffAlvo","atributo":"evasiva","valor":3,"duracao":2,"empilha":true}].', items: { type: 'OBJECT', properties: { tipo: { type: 'STRING', enum: ['curarAtacante', 'energiaAtacante', 'drenarEnergiaAlvo', 'debuffAlvo', 'reduzirCuraAlvo'] }, fator: { type: 'NUMBER', description: 'Só reduzirCuraAlvo: fator da cura do alvo (0.01 a 1; 0.5 = metade). Use duracao (turnos do alvo). valor pode ficar fora.' }, atributo: { type: 'STRING', enum: ['evasiva', 'resistencia', 'acerto', 'cd'], description: 'Só debuffAlvo: o que o alvo perde (resistencia = save; cd = CD das habilidades dele). valor = pontos perdidos.' }, duracao: { type: 'INTEGER', description: 'Só debuffAlvo: turnos do alvo (1 a 20).' }, empilha: { type: 'BOOLEAN', description: 'Só debuffAlvo: cada golpe soma um debuff novo.' }, maximo: { type: 'NUMBER', description: 'Só debuffAlvo com empilha: teto do acúmulo em pontos (ex.: valor 5 e maximo 15 = para em -15).' }, roubar: { type: 'BOOLEAN', description: 'Só drenarEnergiaAlvo: quem acertou recebe exatamente o que saiu do alvo.' }, modo: { type: 'STRING', enum: ['fixo', 'percAtual', 'percMax'], description: 'fixo = valor na escala exibida (como o Dano); percAtual = % do valor atual; percMax = % do máximo.' }, valor: { type: 'NUMBER' }, energia: { type: 'STRING', enum: ['mana', 'aura', 'chakra', 'corpo'], description: 'Só com energiaAtacante e drenarEnergiaAlvo.' }, apenasCritico: { type: 'BOOLEAN' } }, required: ['tipo'] } },
                usosMax: { type: 'INTEGER', description: 'Quantas vezes pode ser ligada (1 a 99). Omita se for ilimitada.' },
                custoPorTurno: { type: 'ARRAY', description: 'Energia cobrada no início de cada turno enquanto o Poder está ligado; um item por energia (ex.: 10% de corpo e 10% de aura = 2 itens). Omita se não houver.', items: { type: 'OBJECT', properties: { modo: { type: 'STRING', enum: ['fixo', 'percMax'] }, valor: { type: 'NUMBER' }, energia: { type: 'STRING', enum: ['mana', 'aura', 'chakra', 'corpo'] } } } },
                cobrarAoAtivar: { type: 'BOOLEAN', description: 'true se o custo por turno também é cobrado UMA vez ao ligar/ativar (ex.: Portões, Instinto). Só com custoPorTurno. Omita se não.' },
                danoVerdadeiro: { type: 'BOOLEAN', description: 'true se o dano deste Poder é Dano Verdadeiro (ignora resistências e imunidades). Omita se não for.' },
                escudoAoLigar: { type: 'OBJECT', description: 'Barreira/escudo/vida temporária que o Poder cria ao ser ligado e some ao desligar (ex.: Domo Gélido com 1600). Omita se não houver.', properties: { nome: { type: 'STRING' }, valor: { type: 'NUMBER', description: 'Pontos de vida da barreira (escala do dano).' }, tipo: { type: 'STRING', enum: ['escudo', 'vidaTemporaria'] } }, required: ['nome', 'valor'] },
                recargaTurnos: { type: 'INTEGER', description: 'Turnos do dono a esperar para usar de novo (1 a 99). Omita se não houver recarga.' },
                reutilizacao: { type: 'OBJECT', description: `O golpe é reusado SEM pagar o custo de novo. Por nº de alvos atingidos: {"porAlvos":{"1":5,"2":3,"3":2}} (5 reusos se acertar 1 alvo, 3 se 2, 2 se 3 ou mais). Por chance: {"chance":50,"max":3,"extra":"50d4"} (cada reuso só ocorre com 50% de chance, até 3, somando o dado extra ao dano de cada reuso; \"extra\" opcional). Máx. ${LIMITE_REUSOS} reusos. Use só um dos dois modos; omita se não houver reuso.`, properties: { porAlvos: { type: 'OBJECT', description: 'Chave = nº de alvos atingidos ("1","2","3"...), valor = quantos reusos.' }, chance: { type: 'NUMBER', description: '% de chance de cada reuso (1 a 100).' }, max: { type: 'INTEGER', description: `Máximo de reusos (1 a ${LIMITE_REUSOS}).` }, extra: { type: 'STRING', description: 'Dado somado ao dano de cada reuso, formato NdM (opcional).' } } },
                gatilhos: GATILHOS_SCHEMA,
                aoDesligar: { type: 'OBJECT', description: 'Dano em si quando desligado à mão. Omita se não houver.', properties: { dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' }, texto: { type: 'STRING' } } },
                usosPor: { type: 'STRING', enum: ['cena', 'descanso'], description: 'Quando os usos renovam: cena (ao trocar de cena ou descansar) ou descanso. Só com usosMax.' },
                maestria: { type: 'NUMBER' }, maestriaRequerida: { type: 'NUMBER' }, fadigaPorUso: { type: 'NUMBER', description: 'Só Formas.' },
                efeitos: EFEITOS_SCHEMA, efeitosPassivos: EFEITOS_SCHEMA,
                aplicaEstados: ESTADOS_SCHEMA, reflexo: REFLEXO_SCHEMA, suporte: SUPORTE_SCHEMA,
            },
            required: ['nome', 'categoria'],
        },
    },
    {
        name: 'propor_combo',
        description: 'Prepara um COMBO (estilo de luta em sequência): um golpe INICIADOR e uma fila fixa de golpes seguintes. Cada golpe dá buffs (mesmos efeitos de uma Habilidade) que SOMAM aos dos golpes anteriores enquanto o Combo avança e ficam no máximo ao concluir. Serve para transcrever um Combo que o jogador descreveu em texto. NÃO grava: vira um cartão de confirmação. Ações gastas: padrao, bonus ou reacao.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                nome: { type: 'STRING' },
                descricao: { type: 'STRING' },
                iniciador: { type: 'OBJECT', description: 'O golpe que, ao acertar, inicia o Combo.', properties: { ...SCHEMA_GOLPE, buffs: EFEITOS_SCHEMA }, required: ['nome'] },
                passos: { type: 'ARRAY', description: 'Os golpes seguintes, em ordem (golpe 2, 3...).', items: { type: 'OBJECT', properties: { ...SCHEMA_GOLPE, buffs: EFEITOS_SCHEMA }, required: ['nome'] } },
            },
            required: ['nome', 'iniciador', 'passos'],
        },
    },
    {
        name: 'propor_follow_up',
        description: 'Prepara um FOLLOW UP: golpe usável dentro de Combos (ou a qualquer momento) e fora do turno, pagando Reação, Ação Bônus ou Ação segurada, com NÍVEIS de buff que sobem conforme o número de Combos finalizados no combate. NÃO grava: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                ...{ nome: { type: 'STRING' }, tipo: SCHEMA_GOLPE.tipo, acao: SCHEMA_GOLPE.acao, descricao: SCHEMA_GOLPE.descricao },
                quando: { type: 'STRING', enum: QUANDO_FOLLOW_UP.map(q => q.id), description: 'combo = só durante um Combo; qualquer = a qualquer momento do combate.' },
                acoesPermitidas: { type: 'ARRAY', description: 'Ações que podem pagar o Follow Up.', items: { type: 'STRING', enum: ACOES_GOLPE.map(a => a.id) } },
                niveis: {
                    type: 'ARRAY',
                    description: 'Níveis de buff em ordem crescente. "combos" = quantos Combos finalizados no combate são necessários (o primeiro nível costuma ser 0).',
                    items: { type: 'OBJECT', properties: { combos: { type: 'INTEGER' }, descricao: { type: 'STRING' }, buffs: EFEITOS_SCHEMA }, required: ['combos'] },
                },
            },
            required: ['nome'],
        },
    },
    {
        name: 'propor_magia',
        description: 'Prepara uma Técnica Elemental (magia). NÃO grava: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                nome: { type: 'STRING' }, descricao: { type: 'STRING' },
                elemento: { type: 'STRING', description: 'Ex.: Fogo, Raio, Vento, Agua, Terra, Neutro, Gelo, Luz, Trevas, Solar...' },
                elementosAfetados: { type: 'STRING' },
                tipoMecanica: { type: 'STRING', enum: TIPOS_MECANICA_MAGIA },
                savingAttr: { type: 'STRING', enum: ATRIBUTOS_SAVING },
                bonusTipo: { type: 'STRING', enum: BONUS_MAGIA }, bonusValor: { type: 'NUMBER' },
                custoValor: { type: 'NUMBER' }, energiaCombustao: { type: 'STRING', enum: ENERGIAS_COMBUSTAO },
                dadosExtraQtd: { type: 'INTEGER' }, dadosExtraFaces: { type: 'INTEGER' },
                alcanceQuad: { type: 'NUMBER' }, areaQuad: { type: 'NUMBER' },
                alvosAfetados: { type: 'STRING', enum: ALVOS_MAGIA }, duracaoZona: { type: 'INTEGER' },
                aplicaEstados: ESTADOS_SCHEMA, reflexo: REFLEXO_SCHEMA, suporte: SUPORTE_SCHEMA,
            },
            required: ['nome', 'elemento'],
        },
    },
    {
        name: 'propor_item',
        description: 'Prepara um item do Arsenal (arma, armadura ou artefato). NÃO grava: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                alvo: ALVO_SCHEMA,
                nome: { type: 'STRING' },
                tipo: { type: 'STRING', enum: TIPOS_ITEM },
                armaTipo: { type: 'STRING', enum: TIPOS_ARMA },
                raridade: { type: 'STRING', enum: RARIDADES_ITEM },
                bonusTipo: { type: 'STRING', enum: BONUS_ITEM }, bonusValor: { type: 'NUMBER' },
                dadosQtd: { type: 'INTEGER' }, dadosFaces: { type: 'INTEGER' }, alcance: { type: 'NUMBER' },
                efeitos: EFEITOS_SCHEMA, efeitosPassivos: EFEITOS_SCHEMA,
                aplicaEstados: ESTADOS_SCHEMA, suporte: SUPORTE_SCHEMA,
            },
            required: ['nome', 'tipo'],
        },
    },
    {
        name: 'propor_npc',
        description: 'SÓ MESTRE: prepara NPCs/dummies para a cena atual do Mapa. NÃO cria: vira um cartão para o Mestre aplicar. Use poder_do_grupo antes para equilibrar a Vida.',
        parameters: {
            type: 'OBJECT',
            properties: {
                nome: { type: 'STRING' },
                vida: { type: 'NUMBER', description: 'Vida máxima na escala mostrada na tela (a mesma do Mapa).' },
                tipoDefesa: { type: 'STRING', enum: DEFESAS_NPC }, valorDefesa: { type: 'NUMBER' },
                visibilidadeHp: { type: 'STRING', enum: VISIBILIDADES_HP },
                poder: { type: 'NUMBER', description: 'Poder Calculado do NPC (escala do Scouter, a mesma de poder_do_grupo). O dano no combate segue a diferença de Poder: com o dobro de Poder ou mais, o mais fraco não causa dano.' },
                quantidade: { type: 'INTEGER', description: '1 a 10 cópias.' },
            },
            required: ['nome', 'vida'],
        },
    },
    {
        name: 'poder_do_grupo',
        description: 'SÓ MESTRE: Poder Calculado, Vida máxima e Fadiga dos personagens de jogadores, com médias — para equilibrar inimigos.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'propor_tier_list',
        description: 'SÓ MESTRE: sugere os ranks da Tier List do capítulo aberto. NÃO aplica: vira um cartão de confirmação.',
        parameters: {
            type: 'OBJECT',
            properties: {
                ranks: {
                    type: 'ARRAY',
                    items: { type: 'OBJECT', properties: { nome: { type: 'STRING' }, rank: { type: 'STRING', enum: IDS_RANKS } }, required: ['nome', 'rank'] },
                },
            },
            required: ['ranks'],
        },
    },
];

export const TIPO_POR_FERRAMENTA = {
    propor_habilidade: 'poder', propor_magia: 'magia', propor_item: 'item', propor_npc: 'npc', propor_tier_list: 'tierlist', propor_combo: 'combo', propor_follow_up: 'followup',
};
export const TIPOS_SO_MESTRE = ['npc', 'tierlist'];
