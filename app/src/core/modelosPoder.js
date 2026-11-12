// ==========================================
// 🧩 MODELOS PRONTOS DE PODER — lógica pura. O Mestre concede de uma vez o poder + contadores + gatilhos de uma mecânica
// que hoje exigiria percorrer várias telas (Ego Superior, Verg Avesta). Nada aqui toca em React nem no Firebase.
//
// Catálogo: MODELOS = [{ id, nome, resumo, categoria, temOrigem?, partes: [{ id, rotulo, descricao, padrao, parametros, suportado }], construir }]
//   suportado: true = vira regra do app | 'nota' = não existe no app e vira NOTA na descrição do poder (o Mestre aplica à mão).
//   construir(selecao, params, fichaAtual, opcoes) => { poder, contadores, reaproveitados, avisos }.
// Marcas no poder (campos opcionais; o resto do app os ignora): poder.modelo = { id, partes, params } e poder.origem = { tipo, fonte }.
// Gatilhos criados têm id `mp_<modelo>_<parte>_<n>` (o id dá para saber de que parte vieram, pois normalizarGatilhos só guarda campos conhecidos);
// os efeitos têm nome fixo por parte; os contadores têm id fixo `mp_<modelo>_<nome>`. Por isso "Editar partes" regenera o que o modelo
// criou antes e troca só isso, sem tocar no que o Mestre/jogador acrescentou à mão.
//
// SUPOSIÇÕES (detalhe em D:\sistema rpg anime\ficha-referencia\modelos-prontos.md):
//  - Os ganhos (+2%/+3%/+4% etc.) são ações `ganhoPermanente` em PERCENTUAL, com duração por parte ('combate' => ficha.ganhosCombate, zera no fim da luta; 'permanente') e modo: 'multiplicar' (composto em fatorPoder; padrão do Ego temporário)
//    ou 'somar' (linear em ficha.ganhosPermanentes.poderCalculado, +p/100; padrão do Verg). Params antigos sem `modo` caem no padrão da parte ao regenerar.
//  - Ego (SUPOSIÇÃO editável): temporário +2/3/4% multiplicar; permanente menor +0,2/0,3/0,4% somar; críticos sofridos: +2% (combate, multiplicar) e +0,2% (permanente, somar). Params antigos (modoAcerto, ganhoNormal/Critico/Fatal, modoDanoSofrido, ganhoPorCriticos, ganhoPorFatal, criticosPorGanho) = partes TEMPORÁRIAS; os novos têm sufixo Perm. Os dois tipos compartilham os ids de gatilho mp_ego_acerto_N/mp_ego_dano_N (limite de 8).
//  - Verg: cada golpe acumulado vale 1/divisor de 1% (divisor 10 = 0,1% por golpe).
//  - Gatilhos nascem `automatico` + `armado` (o Mestre concede de propósito); a opção `criarOpcionais` os cria opcionais e desarmados.
//  - Verg: o crescimento por turno NÃO é gatilho próprio: a parte 'crescimentoAdaptacao' liga o mUnico Crescente da Adaptação (ficha.combate.municoAuto/municoPorTurno;
//    avancarMunicoCrescente em core/poder.js). poder.modelo.adaptacao = { ligou, taxa }: `ligou` só é true se ESTE modelo ligou o interruptor (desmarcar a parte só desliga se ligou).
//    Migração: a parte antiga 'acertoPorTurno' (+N fixo de Acerto por turno) saiu; o gatilho mp_verg_acerto_1 é removido ao regenerar e o params antigo `acertoPorTurno` é ignorado
//    (o significado mudou de 'Acerto fixo' para '% de crescimento do mUnico'; padrão 5).
//  - Ego: o contador de críticos sofridos tem reset 'cena' (os críticos sofridos pela metade se perdem ao fim da cena; pergunta aberta ao usuário).
//  - O contador que alimenta um ganho em `fimDeLuta` é PERMANENTE (não 'cena'): resetarContadoresDeCena roda ANTES dos gatilhos de fimDeLuta
//    (core/gatilhosAplicar.js > dispararEventoNaFicha) e zeraria o contador antes de o ganho lê-lo. O próprio ganho zera o contador (zerar: true).
// ==========================================
import { normalizarPoder } from './sextaFeiraCriacao.js';
import { normalizarGatilhos, LIMITE_GATILHOS_POR_FONTE } from './gatilhos.js';
import { normalizarContador, listaDeContadores, LIMITE_CONTADORES } from './contadores.js';

export const ORIGENS_PODER = [
    { id: 'herdada', rotulo: 'Herdada de um ser' },
    { id: 'independente', rotulo: 'Independente' },
];
const LIMITE_EFEITOS = 12;
const LIMITE_FONTE_ORIGEM = 60;

export const MODOS_GANHO = [{ id: 'multiplicar', rotulo: 'Multiplicar o Poder (composto)' }, { id: 'somar', rotulo: 'Somar ao bônus (linear)' }];
const modoGanho = (v, padrao) => (v === 'somar' || v === 'multiplicar' ? v : padrao);
const textoModo = (modo) => (modo === 'multiplicar' ? 'multiplica' : 'soma');
const numero = (v, padrao) => { if (v === '' || v === null || v === undefined) return padrao; const n = Number(v); return Number.isFinite(n) ? n : padrao; };
const preso = (n, min, max) => Math.max(min, Math.min(max, n));

// ---------- Origem (só informativa; a mecânica é a mesma nos dois casos) ----------
export function normalizarOrigem(bruta) {
    const o = bruta && typeof bruta === 'object' ? bruta : {};
    const tipo = ORIGENS_PODER.some(x => x.id === o.tipo) ? o.tipo : 'herdada';
    return { tipo, fonte: String(o.fonte ?? '').trim().slice(0, LIMITE_FONTE_ORIGEM) };
}

// Texto curto do selo no cartão do poder; '' se o poder não tem origem.
export function descreverOrigem(origem) {
    if (!origem || typeof origem !== 'object' || !ORIGENS_PODER.some(x => x.id === origem.tipo)) return '';
    if (origem.tipo === 'independente') return 'Independente';
    const fonte = String(origem.fonte ?? '').trim();
    return fonte ? `Herdada de ${fonte}` : 'Herdada de um ser';
}

// ---------- Blocos de gatilho ----------
const idGatilho = (modelo, parte, n) => `mp_${modelo}_${parte}_${n}`;
const idContador = (modelo, nome) => `mp_${modelo}_${nome}`;

// ---------- 🌟 EGO SUPERIOR ----------
const ID_CONTADOR_EGO = idContador('ego', 'criticos');

// Ganho de Poder do modelo (sempre em %). Duração 'combate' grava em ficha.ganhosCombate (zera no fim da luta); 'permanente' = formato antigo, sem o campo.
const acaoGanho = (modo, valor, duracao, extra = {}) => ({ tipo: 'ganhoPermanente', unidade: 'percentual', modo, ...(duracao === 'combate' ? { duracao: 'combate' } : {}), valor, ...extra });
const rotuloDuracao = (duracao) => (duracao === 'combate' ? 'combate' : 'permanente');
// Ego: chaves dos parâmetros por tipo de ganho. Combate = parâmetros ANTIGOS (migração suave: modelo.params antigos viram a parte temporária); permanente = chaves novas com sufixo Perm.
const CHAVES_EGO = {
    combate: { modoAcerto: 'modoAcerto', normal: 'ganhoNormal', critico: 'ganhoCritico', fatal: 'ganhoFatal', modoDano: 'modoDanoSofrido', serie: 'ganhoPorCriticos', fatalSofrido: 'ganhoPorFatal' },
    permanente: { modoAcerto: 'modoAcertoPerm', normal: 'ganhoNormalPerm', critico: 'ganhoCriticoPerm', fatal: 'ganhoFatalPerm', modoDano: 'modoDanoSofridoPerm', serie: 'ganhoPorCriticosPerm', fatalSofrido: 'ganhoPorFatalPerm' },
};
const PADRAO_MODO_EGO = { combate: 'multiplicar', permanente: 'somar' };
// Os gatilhos dos dois tipos compartilham os MESMOS ids (limite de 8 gatilhos): materialDaSelecao junta as ações de ids iguais (ver juntarGatilhosDeMesmoId).
function gatilhosAcertoEgo(p, duracao) {
    const k = CHAVES_EGO[duracao];
    const modo = modoGanho(p[k.modoAcerto], PADRAO_MODO_EGO[duracao]);
    const gatilhos = [];
    [['normal', k.normal, 'normal'], ['critico', k.critico, 'crítico'], ['fatal', k.fatal, 'fatal']].forEach(([nivel, chave, rotulo], i) => {
        const valor = numero(p[chave], 0);
        if (valor > 0) gatilhos.push({ id: idGatilho('ego', 'acerto', i + 1), nome: `Ego: +${valor}% por acerto ${rotulo} (${textoModo(modo)}, ${rotuloDuracao(duracao)})`, evento: { tipo: 'acertou', nivel }, acoes: [acaoGanho(modo, valor, duracao)], _ganho: { valor, duracao }, _alvo: `por acerto ${rotulo}` });
    });
    return gatilhos;
}
function gatilhosDanoSofridoEgo(p, duracao) {
    const k = CHAVES_EGO[duracao];
    const gatilhos = []; const contadores = [];
    const porSerie = Math.floor(preso(numero(p.criticosPorGanho, 3), 1, 100));
    const ganhoSerie = numero(p[k.serie], 0);
    const ganhoFatal = numero(p[k.fatalSofrido], 0);
    const modo = modoGanho(p[k.modoDano], PADRAO_MODO_EGO[duracao]);
    const d = rotuloDuracao(duracao);
    if (ganhoSerie > 0) {
        contadores.push({ id: ID_CONTADOR_EGO, nome: 'Ego: críticos sofridos', min: 0, max: porSerie, reset: 'cena' });
        gatilhos.push({ id: idGatilho('ego', 'dano', 1), nome: 'Ego: conta crítico sofrido', evento: { tipo: 'atingido', nivel: 'critico' }, acoes: [{ tipo: 'contador', id: ID_CONTADOR_EGO, op: 'somar', valor: 1 }] });
        gatilhos.push({
            id: idGatilho('ego', 'dano', 2), nome: `Ego: +${ganhoSerie}% a cada ${porSerie} críticos sofridos (${textoModo(modo)}, ${d})`,
            evento: { tipo: 'contadorAtingiu', contadorId: ID_CONTADOR_EGO, op: '>=', valor: porSerie },
            acoes: [acaoGanho(modo, ganhoSerie, duracao), { tipo: 'contador', id: ID_CONTADOR_EGO, op: 'zerar' }], _ganho: { valor: ganhoSerie, duracao }, _alvo: `a cada ${porSerie} críticos`,
        });
    }
    if (ganhoFatal > 0) gatilhos.push({ id: idGatilho('ego', 'dano', 3), nome: `Ego: +${ganhoFatal}% por fatal sofrido (${textoModo(modo)}, ${d})`, evento: { tipo: 'atingido', nivel: 'fatal' }, acoes: [acaoGanho(modo, ganhoFatal, duracao)], _ganho: { valor: ganhoFatal, duracao }, _alvo: 'por fatal sofrido' });
    return { gatilhos, contadores };
}

// Partes diferentes podem emitir o MESMO id de gatilho/contador (Ego: ganho temporário + permanente no mesmo evento). Junta: ações concatenadas sem repetir
// (contador 'zerar' sempre por último, para os ganhos lerem o valor antes), nome unido por ' + '; contador repetido fica uma vez só.
function juntarGatilhosDeMesmoId(lista) {
    const porId = new Map();
    lista.forEach((g) => {
        const antes = porId.get(g.id);
        if (!antes) { porId.set(g.id, { ...g, acoes: [...g.acoes], ...(g._ganho ? { _ganhos: [g._ganho] } : {}) }); return; }
        if (g._ganho && antes._ganhos) {
            antes._ganhos.push(g._ganho);
            const txt = antes._ganhos.map(x => `+${String(x.valor).replace('.', ',')}% (${x.duracao === 'combate' ? 'combate' : 'perm.'})`).join(' e ');
            antes.nome = `Ego: ${txt} ${antes._alvo}`;
        }
        g.acoes.forEach((a) => { if (!antes.acoes.some(x => JSON.stringify(x) === JSON.stringify(a))) antes.acoes.push(a); });
    });
    const zera = (a) => a.tipo === 'contador' && a.op === 'zerar';
    return [...porId.values()].map(({ _ganho, _ganhos, _alvo, ...g }) => ({ ...g, acoes: [...g.acoes.filter(a => !zera(a)), ...g.acoes.filter(zera)] }));
}
const juntarContadoresDeMesmoId = (lista) => { const vistos = new Map(); lista.forEach((c) => { if (!vistos.has(String(c.id))) vistos.set(String(c.id), c); }); return [...vistos.values()]; };

const EGO = {
    id: 'egoSuperior',
    curto: 'ego',
    nome: 'Ego Superior',
    resumo: 'Forma Especial com 140x em Vida, Dano, Status e Energias; ganha Poder em % por acerto e por golpe crítico/fatal sofrido, de DOIS tipos (durante o combate e permanente); imune a condições.',
    categoria: 'forma',
    temOrigem: false,
    descricao: 'Forma Especial. Cada acerto e golpe crítico/fatal sofrido dá ganho de Poder em %: um temporário (só durante o combate, zera no fim da luta) e um permanente menor (multiplica ou soma, conforme o modo). Energia Potencial: sem limite (ignorada pelo app).',
    partes: [
        {
            id: 'multiplicadores', rotulo: 'Multiplicador x140', suportado: true, padrao: true,
            descricao: 'Vida, Dano, todos os Status e todas as Energias multiplicados (E-46). Cura x140 vira nota.',
            parametros: [{ id: 'fatorEgo', rotulo: 'Multiplicador', tipo: 'numero', padrao: 140, min: 1, max: 100000 }],
        },
        {
            id: 'prestigioPorAcerto', rotulo: 'Poder por acerto — durante o combate', suportado: true, padrao: true,
            descricao: 'TEMPORÁRIO: cada acerto dá um ganho de Poder em % (normal, crítico e fatal) que vale só durante o combate e zera no fim da luta (E-51). Modo: multiplica o Poder atual (composto, padrão) ou soma ao bônus (linear).',
            parametros: [
                { id: 'modoAcerto', rotulo: 'Modo', tipo: 'modo', padrao: 'multiplicar' },
                { id: 'ganhoNormal', rotulo: 'Acerto normal (%)', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
                { id: 'ganhoCritico', rotulo: 'Acerto crítico (%)', tipo: 'numero', padrao: 3, min: 0, max: 1000 },
                { id: 'ganhoFatal', rotulo: 'Acerto fatal (%)', tipo: 'numero', padrao: 4, min: 0, max: 1000 },
            ],
        },
        {
            id: 'prestigioPermanentePorAcerto', rotulo: 'Poder por acerto — permanente', suportado: true, padrao: true,
            descricao: 'PERMANENTE: cada acerto dá também um ganho que fica para sempre (não zera). Valores menores por padrão (SUPOSIÇÃO editável: +0,2%/+0,3%/+0,4%, soma).',
            parametros: [
                { id: 'modoAcertoPerm', rotulo: 'Modo', tipo: 'modo', padrao: 'somar' },
                { id: 'ganhoNormalPerm', rotulo: 'Acerto normal (%)', tipo: 'numero', padrao: 0.2, min: 0, max: 1000 },
                { id: 'ganhoCriticoPerm', rotulo: 'Acerto crítico (%)', tipo: 'numero', padrao: 0.3, min: 0, max: 1000 },
                { id: 'ganhoFatalPerm', rotulo: 'Acerto fatal (%)', tipo: 'numero', padrao: 0.4, min: 0, max: 1000 },
            ],
        },
        {
            id: 'prestigioPorDanoSofrido', rotulo: 'Poder por crítico/fatal sofrido — durante o combate', suportado: true, padrao: true,
            descricao: 'TEMPORÁRIO: a cada N críticos sofridos (contador) ou 1 fatal sofrido, ganho de Poder em % só durante o combate (E-50). Modo: multiplica (composto, padrão) ou soma (linear).',
            parametros: [
                { id: 'modoDanoSofrido', rotulo: 'Modo', tipo: 'modo', padrao: 'multiplicar' },
                { id: 'criticosPorGanho', rotulo: 'Críticos sofridos por ganho (vale para as duas partes)', tipo: 'numero', padrao: 3, min: 1, max: 100 },
                { id: 'ganhoPorCriticos', rotulo: 'Ganho (%) a cada série de críticos', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
                { id: 'ganhoPorFatal', rotulo: 'Ganho (%) por fatal sofrido', tipo: 'numero', padrao: 2, min: 0, max: 1000 },
            ],
        },
        {
            id: 'prestigioPermanentePorDanoSofrido', rotulo: 'Poder por crítico/fatal sofrido — permanente', suportado: true, padrao: true,
            descricao: 'PERMANENTE: a cada série de críticos sofridos ou fatal sofrido, ganho que fica para sempre. Padrão menor (SUPOSIÇÃO editável: +0,2%, soma).',
            parametros: [
                { id: 'modoDanoSofridoPerm', rotulo: 'Modo', tipo: 'modo', padrao: 'somar' },
                { id: 'criticosPorGanho', rotulo: 'Críticos sofridos por ganho (vale para as duas partes)', tipo: 'numero', padrao: 3, min: 1, max: 100 },
                { id: 'ganhoPorCriticosPerm', rotulo: 'Ganho (%) a cada série de críticos', tipo: 'numero', padrao: 0.2, min: 0, max: 1000 },
                { id: 'ganhoPorFatalPerm', rotulo: 'Ganho (%) por fatal sofrido', tipo: 'numero', padrao: 0.2, min: 0, max: 1000 },
            ],
        },
        {
            id: 'imunidadeCondicoes', rotulo: 'Imune a condições', suportado: true, padrao: true,
            descricao: 'Não recebe nenhum estado enquanto a forma estiver ligada (E-59).',
            parametros: [],
        },
        {
            id: 'ascensaoAdicional', rotulo: 'Ascensão adicional (+10)', suportado: 'nota', padrao: true,
            descricao: '+10 de Ascensão em cada; os pontos viram pontos de morte/vida temporários (E-48). Vira nota.',
            parametros: [],
        },
        {
            id: 'habilidadesDeRaca', rotulo: 'Habilidades viram poderes de raça', suportado: 'nota', padrao: true,
            descricao: 'Todas as habilidades nesta forma contam como poderes de raça (E-49). Vira nota.',
            parametros: [],
        },
    ],
    // Cada parte devolve { efeitos, gatilhos, contadores, notas }.
    montar: {
        multiplicadores: (p) => {
            const valor = String(preso(numero(p.fatorEgo, 140), 1, 100000));
            const efeito = (nome, atributo) => ({ nome: `Ego Superior: ${nome}`, atributo, propriedade: 'munico', valor });
            return {
                efeitos: [efeito('Vida', 'vida'), efeito('Dano', 'dano'), efeito('Status', 'todos_status'), efeito('Energias', 'todas_energias')],
                notas: [`Cura x${valor}: o app não tem atributo de Cura; aplique à mão.`],
            };
        },
        prestigioPorAcerto: (p) => ({ gatilhos: gatilhosAcertoEgo(p, 'combate') }),
        prestigioPermanentePorAcerto: (p) => ({ gatilhos: gatilhosAcertoEgo(p, 'permanente') }),
        prestigioPorDanoSofrido: (p) => gatilhosDanoSofridoEgo(p, 'combate'),
        prestigioPermanentePorDanoSofrido: (p) => gatilhosDanoSofridoEgo(p, 'permanente'),
        imunidadeCondicoes: () => ({ efeitos: [{ nome: 'Ego Superior: imune a condições', atributo: 'imune_estado', propriedade: 'base', valor: '1', escopo: 'todos' }] }),
        ascensaoAdicional: () => ({ notas: ['Ascensão adicional: +10 de Ascensão em cada ao ativar; os pontos de prestígio adicionais viram pontos de morte e vida temporários (aplique à mão). Os ganhos por acerto/crítico sofrido não contam para esses pontos.'] }),
        habilidadesDeRaca: () => ({ notas: ['Nesta forma, todas as habilidades contam como poderes de raça.'] }),
    },
};

// ---------- 🌀 VERG AVESTA ----------
const ID_CONTADOR_VERG = idContador('verg', 'acumulo');

const VERG = {
    id: 'vergAvesta',
    curto: 'verg',
    nome: 'Verg Avesta',
    resumo: 'Habilidade que acumula o que sofre e, ao fim da luta, converte em Poder permanente; liga o mUnico Crescente da Adaptação (+X% por turno).',
    categoria: 'habilidade',
    temOrigem: true,
    descricao: 'Habilidade passiva: acumula os golpes sofridos e, ao fim da luta (cena), o acumulado vira ganho permanente de Poder em % (cada golpe = 1/divisor de 1%).',
    partes: [
        {
            id: 'acumuloDeDano', rotulo: 'Acúmulo → ganho permanente', suportado: true, padrao: true,
            descricao: 'Conta cada golpe que causa dano na Vida; no fim da cena cada golpe acumulado vale 1/divisor de 1% de Poder permanente e o contador zera (A-31). Modo: soma (linear, padrão) ou multiplica (composto).',
            parametros: [
                { id: 'modoAcumulo', rotulo: 'Modo', tipo: 'modo', padrao: 'somar' },
                { id: 'divisor', rotulo: 'Divisor do acumulado (cada golpe = 1/divisor de 1%)', tipo: 'numero', padrao: 10, min: 1, max: 1000 },
                { id: 'limiteAcumulo', rotulo: 'Máximo do contador', tipo: 'numero', padrao: 999, min: 1, max: 9999 },
            ],
        },
        {
            id: 'crescimentoAdaptacao', rotulo: 'Crescimento por turno (Adaptação)', suportado: true, padrao: true,
            descricao: 'Liga o "mUnico Crescente (Por Turno)" da Adaptação (Ficha > Marcadores & Adaptação): "Crescer sozinho" fica ligado e a taxa por turno vira o valor abaixo (A-31). Desmarcar desliga só se foi este modelo que ligou.',
            parametros: [{ id: 'taxaPorTurno', rotulo: 'Crescimento por turno (%)', tipo: 'numero', padrao: 5, min: 0.1, max: 1000 }],
        },
        {
            id: 'vidaMaxima', rotulo: 'Vida máxima ÷ 8', suportado: 'nota', padrao: true,
            descricao: 'A vida máxima soma o dano total sofrido ÷ 8. Vira nota.', parametros: [],
        },
        {
            id: 'curaAcumulada', rotulo: 'Cura acumulada', suportado: 'nota', padrao: true,
            descricao: 'A cura recebida também acumula (1/20-1/10, ao fim 1/200-1/80). Vira nota.', parametros: [],
        },
        {
            id: 'adaptacao', rotulo: 'Resistência/imunidade por tipo', suportado: 'nota', padrao: true,
            descricao: 'Resistência e imunidade a um tipo de dano após N ataques do mesmo tipo. O app não tem adaptação por tipo. Vira nota.', parametros: [],
        },
        {
            id: 'expansao', rotulo: 'Expansão: x4, x6, x8, x10, x25', suportado: 'nota', padrao: true,
            descricao: 'Na expansão, multiplicadores por turno (a esfera gira). Vira nota.', parametros: [],
        },
    ],
    idsLegados: ['mp_verg_acerto_1'], // gatilho da parte antiga 'acertoPorTurno' (removida): sai ao regenerar
    montar: {
        acumuloDeDano: (p) => {
            const divisor = preso(numero(p.divisor, 10), 1, 1000);
            const maximo = Math.floor(preso(numero(p.limiteAcumulo, 999), 1, 9999));
            const fator = Math.round((1 / divisor) * 1e6) / 1e6; // % de Poder por golpe acumulado
            const modo = modoGanho(p.modoAcumulo, 'somar');
            return {
                contadores: [{ id: ID_CONTADOR_VERG, nome: 'Verg Avesta: acumulado', min: 0, max: maximo }],
                gatilhos: [
                    { id: idGatilho('verg', 'acumulo', 1), nome: 'Verg: acumula o golpe sofrido', evento: { tipo: 'atingido', nivel: 'qualquer' }, passivo: true, acoes: [{ tipo: 'contador', id: ID_CONTADOR_VERG, op: 'somar', valor: 1 }] },
                    { id: idGatilho('verg', 'acumulo', 2), nome: `Verg: acumulado ÷ ${divisor} vira Poder (${textoModo(modo)})`, evento: { tipo: 'fimDeLuta' }, passivo: true, acoes: [{ tipo: 'ganhoPermanente', unidade: 'percentual', modo, deContador: { id: ID_CONTADOR_VERG, fator, zerar: true } }] },
                ],
                notas: ['Acúmulo: o app conta GOLPES sofridos (não o dano exato); o Mestre ajusta o total em "Ganhos permanentes" se quiser o valor exato.'],
            };
        },
        crescimentoAdaptacao: (p) => {
            const taxa = preso(numero(p.taxaPorTurno, 5), 0.1, 1000);
            return { notas: [`Crescimento por turno: liga a Adaptação (mUnico Crescente) em +${String(taxa).replace('.', ',')}% por turno de combate.`] };
        },
        vidaMaxima: () => ({ notas: ['Vida máxima: soma o dano total sofrido ÷ 8 (aplique à mão).'] }),
        curaAcumulada: () => ({ notas: ['Cura acumulada: 1/20 a 1/10 do curado acumula; ao fim da luta 1/200 a 1/80 vira ganho (aplique à mão).'] }),
        adaptacao: () => ({ notas: ['Adaptação: resistência após 3 a 6 ataques do mesmo tipo e imunidade após 4 a 7, conforme a categoria do dano (básicos 3/2 resistência e 5/4 imunidade; verdadeiros 4/3 e 5/4; avançados e Luz/Escuridão/Éter 5/4 e 6/5; avançados verdadeiros e Infernal/Celestial/Caos 6/5 e 7/6). O app não tem adaptação por tipo: ajuste as afinidades à mão.'] }),
        expansao: () => ({ notas: ['Expansão: a cada turno a esfera gira e deixa x4, x6, x8, x10, x25; após 3 turnos, domínio total do poder do alvo (aplique à mão).'] }),
    },
};

// Seleção/parâmetros válidos de um modelo (partes desconhecidas somem; numéricos presos a [min, max]).
const todasAsPartes = (m) => m.partes;
const parametrosDe = (m) => m.partes.flatMap(p => p.parametros);

export const paramsPadrao = (m) => Object.fromEntries(parametrosDe(m).map(p => [p.id, p.padrao]));
export const selecaoPadrao = (m) => todasAsPartes(m).filter(p => p.padrao).map(p => p.id);

export function normalizarSelecao(m, selecao) {
    const pedidas = new Set(Array.isArray(selecao) ? selecao : []);
    return todasAsPartes(m).filter(p => pedidas.has(p.id)).map(p => p.id);
}
export function normalizarParams(m, params) {
    const bruto = params && typeof params === 'object' ? params : {};
    return Object.fromEntries(parametrosDe(m).map(p => [p.id, p.tipo === 'modo' ? modoGanho(bruto[p.id], p.padrao) : preso(numero(bruto[p.id], p.padrao), p.min, p.max)]));
}

// Material de UMA seleção (sem ficha): efeitos, gatilhos, contadores e notas, nesta ordem de partes.
function materialDaSelecao(m, selecao, params) {
    const sel = normalizarSelecao(m, selecao);
    const par = normalizarParams(m, params);
    const saida = { efeitos: [], gatilhos: [], contadores: [], notas: [] };
    todasAsPartes(m).filter(p => sel.includes(p.id)).forEach((p) => {
        const r = m.montar[p.id](par) || {};
        saida.efeitos.push(...(r.efeitos || []));
        saida.gatilhos.push(...(r.gatilhos || []));
        saida.contadores.push(...(r.contadores || []));
        saida.notas.push(...(r.notas || []));
    });
    saida.gatilhos = juntarGatilhosDeMesmoId(saida.gatilhos);
    saida.contadores = juntarContadoresDeMesmoId(saida.contadores);
    return { sel, par, ...saida };
}

const marcarModo = (g, criarOpcionais) => (criarOpcionais ? { ...g, modo: 'opcional', armado: false } : { ...g, modo: 'automatico', armado: true });

// Constrói o poder do modelo já validado (normalizarPoder + normalizarGatilhos + normalizarContador). Nunca muta a ficha.
function construirDoModelo(m, selecao, params, fichaAtual, opcoes = {}) {
    const mat = materialDaSelecao(m, selecao, params);
    const avisos = [];
    const bruto = {
        nome: m.nome, descricao: m.descricao, categoria: m.categoria,
        efeitos: mat.efeitos.slice(0, LIMITE_EFEITOS),
    };
    const { objeto, avisos: avisosPoder } = normalizarPoder(bruto);
    avisos.push(...avisosPoder.filter(a => !/^Falta o nome/.test(a)));
    const notasDasPartes = mat.notas;
    objeto.notasIA = notasDasPartes.join('\n');
    const { gatilhos, descartados } = normalizarGatilhos(mat.gatilhos.map(g => marcarModo(g, opcoes.criarOpcionais === true)));
    descartados.forEach(d => avisos.push(`Gatilho "${d.nome}" não foi criado: ${d.motivo}.`));
    if (mat.gatilhos.length > LIMITE_GATILHOS_POR_FONTE) avisos.push(`O modelo precisa de mais de ${LIMITE_GATILHOS_POR_FONTE} gatilhos: só os ${LIMITE_GATILHOS_POR_FONTE} primeiros foram mantidos.`);
    if (gatilhos.length > 0) objeto.gatilhos = gatilhos;
    if (m.temOrigem) objeto.origem = normalizarOrigem(opcoes.origem);
    objeto.modelo = { id: m.id, partes: mat.sel, params: mat.par };
    const existenteAviso = acharPoderDoModelo(fichaAtual, m.id);
    if (existenteAviso && existenteAviso.modelo && Array.isArray(existenteAviso.modelo.partes) && existenteAviso.modelo.partes.includes('acertoPorTurno')) {
        avisos.push('O Acerto por turno do Verg agora é o Crescimento por turno da Adaptação (mUnico Crescente): o gatilho antigo sai ao aplicar; marque a parte nova se quiser o crescimento.');
    }
    if (m.id === 'egoSuperior' && existenteAviso && Array.isArray(existenteAviso.gatilhos)
        && !mat.sel.includes('prestigioPermanentePorAcerto') && !mat.sel.includes('prestigioPermanentePorDanoSofrido')
        && existenteAviso.gatilhos.some(g => g && /^mp_ego_/.test(String(g.id || '')) && Array.isArray(g.acoes) && g.acoes.some(a => a && a.tipo === 'ganhoPermanente' && !a.duracao))) {
        avisos.push('⚠️ Os ganhos do Ego por acerto/dano sofrido agora são temporários (zeram no fim da luta). Marque as partes “permanente” se quiser ganhos que ficam.');
    }
    // Contadores: o helper único decide o que criar, reaproveitar (e ajustar) e remover.
    const pc = planejarContadores(m, fichaAtual, mat.sel, mat.par);
    mat.sel.forEach((id) => {
        const parte = m.partes.find(p => p.id === id);
        if (parte && parte.suportado === 'nota') avisos.push(`"${parte.rotulo}" não existe no app: entrou como nota na descrição.`);
    });
    return { poder: objeto, contadores: pc.paraCriar, reaproveitados: pc.paraAtualizar.map(c => String(c.id)), contadoresAtualizar: pc.paraAtualizar, contadoresRemover: [...pc.paraRemover], totalContadores: pc.total, avisos };
}

// Helper ÚNICO dos contadores (plano, construir e aplicar usam este): dado o que a seleção pede,
//  - paraCriar: contadores que faltam na ficha (já normalizados, valor = mínimo);
//  - paraAtualizar: contadores do modelo que já existem na ficha (mesmo id, inclusive órfãos de um poder apagado à mão): nome/min/max são reescritos, o valor é preservado e preso ao novo intervalo;
//  - paraRemover: ids que a seleção ANTIGA do modelo criou e a nova não usa mais (só no modo editar), e que ainda existem na ficha;
//  - total: quantos contadores a ficha terá depois de aplicar.
function planejarContadores(m, ficha, selecao, params) {
    const lista = listaDeContadores(ficha);
    const noFicha = new Set(lista.map(c => String(c.id)));
    const usados = materialDaSelecao(m, selecao, params).contadores;
    const idsUsados = new Set(usados.map(c => String(c.id)));
    const existente = acharPoderDoModelo(ficha, m.id);
    const paraRemover = new Set();
    if (existente && existente.modelo) {
        materialDaSelecao(m, existente.modelo.partes, existente.modelo.params).contadores
            .map(c => String(c.id))
            .filter(id => !idsUsados.has(id) && noFicha.has(id))
            .forEach(id => paraRemover.add(id));
    }
    const paraCriar = []; const paraAtualizar = [];
    usados.forEach((c) => {
        if (noFicha.has(String(c.id))) { paraAtualizar.push(c); return; }
        const n = normalizarContador({ ...c, valor: c.min });
        if (n) paraCriar.push(n);
    });
    return { paraCriar, paraAtualizar, paraRemover, total: lista.length - paraRemover.size + paraCriar.length };
}

// Gatilhos finais do poder no modo EDITAR, calculados ANTES de mutar qualquer coisa:
// os manuais (que o modelo não criou) ficam e os do modelo entram depois. Se algum gatilho do modelo seria descartado, `bloqueio` explica.
function gatilhosFinaisEdicao(m, existente, novo) {
    const antigo = materialDaSelecao(m, existente.modelo.partes, existente.modelo.params);
    const idsAntigos = new Set([...antigo.gatilhos.map(g => g.id), ...(m.idsLegados || [])]);
    const manter = (existente.gatilhos || []).filter(g => g && !idsAntigos.has(g.id));
    const doModelo = novo.poder.gatilhos || [];
    const juntos = normalizarGatilhos([...manter, ...doModelo]);
    const idsFinais = new Set(juntos.gatilhos.map(g => g.id));
    const perdidos = doModelo.filter(g => !idsFinais.has(g.id));
    const bloqueio = perdidos.length > 0
        ? `O poder já tem ${manter.length} gatilho(s) manual(is) e o limite é ${LIMITE_GATILHOS_POR_FONTE} por poder: ${perdidos.length} gatilho(s) do modelo não caberiam. Apague gatilhos manuais ou desmarque partes.`
        : '';
    return { gatilhos: juntos.gatilhos, descartados: juntos.descartados, bloqueio, antigo };
}

export const MODELOS = [EGO, VERG].map(m => ({
    id: m.id, nome: m.nome, resumo: m.resumo, categoria: m.categoria, temOrigem: m.temOrigem, partes: m.partes,
    construir: (selecao, params, fichaAtual, opcoes) => construirDoModelo(m, selecao, params, fichaAtual, opcoes),
    _def: m,
}));

export const obterModelo = (id) => MODELOS.find(m => m.id === id) || null;

// Poder da ficha criado por este modelo (modelo.id igual), ou null.
export const acharPoderDoModelo = (ficha, modeloId) => (ficha && Array.isArray(ficha.poderes) ? ficha.poderes.find(p => p && p.modelo && p.modelo.id === modeloId) || null : null);

// true se o poder do modelo já na ficha tem gatilho `ganhoPermanente` legado (sem `unidade`: valor bruto, +2 = +200%).
export function temGanhoLegado(poder) {
    const gs = poder && Array.isArray(poder.gatilhos) ? poder.gatilhos : [];
    return gs.some(g => g && Array.isArray(g.acoes) && g.acoes.some(a => a && a.tipo === 'ganhoPermanente' && a.unidade === undefined));
}

// O que o Mestre vai ver antes de aplicar: { modo: 'novo'|'editar', poderes, contadores, gatilhos, efeitos, avisos, ok, erro }.
export function planejarModelo(modeloId, selecao, params, fichaAtual, opcoes = {}) {
    const m = obterModelo(modeloId);
    if (!m) return { ok: false, erro: 'Modelo desconhecido.', modo: 'novo', poderes: 0, contadores: 0, gatilhos: 0, efeitos: 0, avisos: [] };
    const sel = normalizarSelecao(m, selecao);
    if (sel.length === 0) return { ok: false, erro: 'Marque ao menos uma parte.', modo: 'novo', poderes: 0, contadores: 0, gatilhos: 0, efeitos: 0, avisos: [] };
    const r = m.construir(sel, params, fichaAtual, opcoes);
    const existente = acharPoderDoModelo(fichaAtual, modeloId);
    let erro = '';
    if (r.totalContadores > LIMITE_CONTADORES) erro = `A ficha só comporta ${LIMITE_CONTADORES} contadores (ficaria com ${r.totalContadores}). Apague algum e tente de novo.`;
    else if (existente) erro = gatilhosFinaisEdicao(m._def, existente, r).bloqueio;
    return {
        ok: !erro, erro,
        modo: existente ? 'editar' : 'novo', poderes: existente ? 0 : 1, contadores: r.contadores.length,
        contadoresAtualizados: r.contadoresAtualizar.length, contadoresRemovidos: r.contadoresRemover.length,
        gatilhos: (r.poder.gatilhos || []).length, efeitos: (r.poder.efeitos || []).length, avisos: r.avisos,
        adaptacao: sel.includes('crescimentoAdaptacao') ? { taxa: r.poder.modelo.params.taxaPorTurno } : null,
    };
}

// Aplica no RASCUNHO da ficha (use dentro de updateFicha). Só o Mestre: `req.isMestre` é conferido aqui também (a UI já esconde o botão).
// req: { modeloId, selecao, params, opcoes?: { origem, criarOpcionais }, isMestre, id? }
// Devolve { ok, mensagem, avisos, modo }. Poder do mesmo modelo já na ficha é ATUALIZADO (não duplica).
export function aplicarModeloNaFicha(ficha, req = {}) {
    if (req.isMestre !== true) return { ok: false, mensagem: 'Só o Mestre pode adicionar de modelo.', avisos: [] };
    const m = obterModelo(req.modeloId);
    if (!ficha || !m) return { ok: false, mensagem: 'Modelo ou ficha inválidos.', avisos: [] };
    const sel = normalizarSelecao(m, req.selecao);
    if (sel.length === 0) return { ok: false, mensagem: 'Marque ao menos uma parte.', avisos: [] };
    const opcoes = req.opcoes || {};
    const novo = m.construir(sel, req.params, ficha, opcoes);
    if (!Array.isArray(ficha.contadores)) ficha.contadores = [];
    if (!Array.isArray(ficha.poderes)) ficha.poderes = [];
    const existente = acharPoderDoModelo(ficha, m.id);

    // ---- Fase 1: valida TUDO antes de mutar (aplicação atômica: tudo ou nada) ----
    if (novo.totalContadores > LIMITE_CONTADORES) {
        return { ok: false, mensagem: `A ficha já tem contadores demais (máximo ${LIMITE_CONTADORES}; ficaria com ${novo.totalContadores}). Apague algum e tente de novo.`, avisos: novo.avisos };
    }
    const edicao = existente ? gatilhosFinaisEdicao(m._def, existente, novo) : null;
    if (edicao && edicao.bloqueio) return { ok: false, mensagem: edicao.bloqueio, avisos: novo.avisos };

    // Adaptação (mUnico Crescente): decidido ANTES de gravar, a partir do estado atual. `ligou` só vale se ESTE modelo ligou o interruptor.
    const temCrescimento = sel.includes('crescimentoAdaptacao');
    const ligouAntes = !!(existente && existente.modelo && existente.modelo.adaptacao && existente.modelo.adaptacao.ligou === true);
    const taxaAdaptacao = temCrescimento ? novo.poder.modelo.params.taxaPorTurno : 0;
    const adaptacao = temCrescimento ? { ligou: ligouAntes || !(ficha.combate && ficha.combate.municoAuto === true), taxa: taxaAdaptacao } : null;
    const aplicarAdaptacao = () => {
        if (temCrescimento) {
            if (!ficha.combate || typeof ficha.combate !== 'object') ficha.combate = {};
            ficha.combate.municoPorTurno = taxaAdaptacao;
            ficha.combate.municoAuto = true;
        } else if (ligouAntes && ficha.combate && typeof ficha.combate === 'object') {
            ficha.combate.municoAuto = false;
        }
    };

    // ---- Fase 2: grava. Contadores do modelo já existentes são reescritos (nome/min/max; valor preservado e preso ao novo intervalo). ----
    // Os contadores do modelo pertencem ao poder: gravam `poderId` (migra também contadores mp_* antigos, sem poderId, ao editar).
    const poderId = existente ? existente.id : (req.id !== undefined ? req.id : Date.now());
    const remover = new Set(novo.contadoresRemover);
    const atualizar = new Map(novo.contadoresAtualizar.map(c => [String(c.id), c]));
    ficha.contadores = [
        ...ficha.contadores.filter(c => c && !remover.has(String(c.id))).map((c) => {
            const a = atualizar.get(String(c.id));
            return a ? (normalizarContador({ ...c, nome: a.nome, min: a.min, max: a.max, poderId }) || c) : c;
        }),
        ...novo.contadores.map(c => ({ ...c, poderId })),
    ];

    if (!existente) {
        aplicarAdaptacao();
        ficha.poderes.push({ ...novo.poder, ...(adaptacao ? { modelo: { ...novo.poder.modelo, adaptacao } } : {}), id: poderId });
        return { ok: true, modo: 'novo', avisos: novo.avisos, mensagem: `${m.nome} adicionado: ${(novo.poder.gatilhos || []).length} gatilho(s), ${novo.contadores.length} contador(es) novo(s).` };
    }

    // Editar partes: tira só o que o modelo criou antes (gatilhos por id, efeitos por nome) e põe o novo; o resto do poder fica.
    const antigo = edicao.antigo;
    const nomesAntigos = new Set(antigo.efeitos.map(e => e.nome));
    const avisos = [...novo.avisos];
    edicao.descartados.forEach(d => avisos.push(`Gatilho "${d.nome}" ficou de fora: ${d.motivo}.`));
    if (edicao.gatilhos.length > 0) existente.gatilhos = edicao.gatilhos; else delete existente.gatilhos;
    const efeitos = [...(existente.efeitos || []).filter(e => e && !nomesAntigos.has(e.nome)), ...(novo.poder.efeitos || [])];
    if (efeitos.length > LIMITE_EFEITOS) avisos.push(`O poder passou de ${LIMITE_EFEITOS} efeitos (${efeitos.length}).`);
    existente.efeitos = efeitos;
    // Notas: troca só se ainda forem as que o modelo escreveu; texto editado à mão fica.
    const notasAntigas = antigo.notas.join('\n');
    // Migração: tira a nota do Acerto por turno do Verg (parte antiga) antes de comparar.
    const notasAtuais = String(existente.notasIA || '').split('\n').filter(l => !/^Acerto por turno: \+/.test(l)).join('\n');
    if (!existente.notasIA || existente.notasIA === notasAntigas || notasAtuais === notasAntigas) existente.notasIA = novo.poder.notasIA;
    else if (novo.poder.notasIA && !existente.notasIA.includes(novo.poder.notasIA)) existente.notasIA = `${existente.notasIA}\n${novo.poder.notasIA}`;
    if (m.temOrigem) existente.origem = novo.poder.origem;
    aplicarAdaptacao();
    existente.modelo = adaptacao ? { ...novo.poder.modelo, adaptacao } : novo.poder.modelo;
    return { ok: true, modo: 'editar', avisos, mensagem: `${m.nome} atualizado: ${(existente.gatilhos || []).length} gatilho(s) no poder.` };
}
