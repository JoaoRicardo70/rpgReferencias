// ==========================================
// SEXTA-FEIRA — FERRAMENTAS (function calling do Gemini), lógica pura.
//
// Em vez de mandar a mesa inteira em cada pergunta, a Sexta-Feira recebe a lista de ferramentas
// abaixo e pede só o que precisa (uma ficha, o combate, o feed, a lore, a Árvore, uma simulação).
// Quem executa é o navegador de quem perguntou, com os dados que o app já tem (store + Firebase).
//
// 🔒 Permissões por papel:
//   - Mestre/Co-Mestre: vê tudo (fichas completas de todos, NPCs/dummies, Futuro dos Registros).
//   - Jogador: a PRÓPRIA ficha completa; dos outros só o público (nome, raça, classe, % de Vida);
//     dummies só nome e % de Vida; Registros só do Presente; simulações só da própria ficha.
//
// 🔢 Todo número vem das funções do motor (core/poder.js, core/fadiga.js, core/vitals.js,
// core/prestigioDistribuicao.js) — a IA nunca calcula Poder/Fadiga por conta própria.
// ==========================================
import { calcularPoderAtual } from './poder.js';
import { getRawBase } from './attributes.js';
import { calcularFadigaAtual, calcularGanhoFadigaDinamico } from './fadiga.js';
import { getTetoExibidoComFator, FATOR_EXIBICAO_VITAIS } from './vitals.js';
import {
    CATEGORIAS_PRESTIGIO, MULTS_BASE_PRESTIGIO, PRESTIGIO_PARA_ASCENDER,
    calcularBaseDoPrestigio, getPontosPrestigioDisponiveis,
} from './prestigioDistribuicao.js';

const VITAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];
const LIMITE_FEED = 30;
const LIMITE_TEXTO_LORE = 6000;
const LIMITE_TURNOS_PROJECAO = 100;

// ---------- declarações enviadas ao Gemini (formato functionDeclarations da API REST) ----------
export const DECLARACOES_FERRAMENTAS = [
    {
        name: 'listar_personagens',
        description: 'Lista os personagens de jogadores e os NPCs/dummies da mesa, com o que quem pergunta pode ver de cada um.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'consultar_ficha',
        description: 'Dados de um personagem calculados pelo motor do jogo: Poder Calculado, vitais, Fadiga, Supressão, Prestígio, Ascensão, poderes ativos, armas e magias. Jogadores só veem a ficha completa do próprio personagem.',
        parameters: {
            type: 'OBJECT',
            properties: { nome: { type: 'STRING', description: 'Nome do personagem (vazio = quem está perguntando).' } },
        },
    },
    {
        name: 'estado_combate',
        description: 'Cena atual do Mapa, ordem de turno, de quem é a vez e quem vem depois.',
        parameters: { type: 'OBJECT', properties: {} },
    },
    {
        name: 'feed_recente',
        description: 'Últimos acontecimentos do feed de combate (ataques, testes, danos, mensagens do sistema), do mais antigo pro mais recente.',
        parameters: {
            type: 'OBJECT',
            properties: { quantidade: { type: 'INTEGER', description: `Quantos eventos (1 a ${LIMITE_FEED}, padrão 15).` } },
        },
    },
    {
        name: 'buscar_lore',
        description: 'Procura um termo nos Registros Akáshicos (capítulos e arcos da história da mesa) e devolve os trechos que o mencionam.',
        parameters: {
            type: 'OBJECT',
            properties: { termo: { type: 'STRING', description: 'Nome, lugar ou assunto a procurar.' } },
            required: ['termo'],
        },
    },
    {
        name: 'buscar_arvore',
        description: 'Procura personagens/NPCs na Árvore Genealógica da mesa (famílias, parentesco, papel, classe, elemento, status, lore).',
        parameters: {
            type: 'OBJECT',
            properties: { termo: { type: 'STRING', description: 'Nome, família ou papel a procurar (vazio = lista as famílias).' } },
        },
    },
    {
        name: 'transcricoes_recentes',
        description: 'Falas transcritas da mesa (voz do Mestre como narrador ou NPC, e dos jogadores) nas últimas horas, da mais antiga pra mais recente.',
        parameters: {
            type: 'OBJECT',
            properties: {
                horas: { type: 'NUMBER', description: 'Quantas horas pra trás (padrão 6, máximo 48).' },
                termo: { type: 'STRING', description: 'Opcional: só falas que contenham este termo (ex.: nome de um NPC).' },
            },
        },
    },
    {
        name: 'memorizar_fato',
        description: 'SOMENTE quando o Mestre pedir explicitamente para você lembrar/guardar algo: grava um fato na memória permanente da mesa.',
        parameters: {
            type: 'OBJECT',
            properties: {
                texto: { type: 'STRING', description: 'O fato, em uma frase curta e completa.' },
                soMestre: { type: 'BOOLEAN', description: 'true se for segredo que só o Mestre pode ver.' },
            },
            required: ['texto'],
        },
    },
    {
        name: 'simular_prestigio',
        description: 'Simula colocar pontos de Prestígio numa categoria (vida, mana, aura, chakra ou corpo) e devolve o Poder Calculado antes e depois, sem mudar nada na ficha.',
        parameters: {
            type: 'OBJECT',
            properties: {
                categoria: { type: 'STRING', description: 'vida, mana, aura, chakra ou corpo.' },
                pontos: { type: 'INTEGER', description: 'Quantos pontos de Prestígio adicionar.' },
                nome: { type: 'STRING', description: 'Personagem (vazio = quem está perguntando).' },
            },
            required: ['categoria', 'pontos'],
        },
    },
    {
        name: 'projetar_fadiga',
        description: 'Projeta a Fadiga de Combate turno a turno lutando com uma Supressão de Poder fixa (sem mudar nada na ficha), e quantos turnos até atingir uma Fadiga alvo.',
        parameters: {
            type: 'OBJECT',
            properties: {
                supressao: { type: 'NUMBER', description: 'Porcentagem do Poder em uso (1 a 100). Vazio = a atual.' },
                turnos: { type: 'INTEGER', description: `Quantos turnos projetar (1 a ${LIMITE_TURNOS_PROJECAO}, padrão 10).` },
                fadigaAlvo: { type: 'NUMBER', description: 'Opcional: Fadiga % alvo pra contar quantos turnos leva.' },
                nome: { type: 'STRING', description: 'Personagem (vazio = quem está perguntando).' },
            },
        },
    },
];

// ---------- utilitários ----------
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const arred = (v, casas = 1) => { const f = Math.pow(10, casas); return Math.round(num(v) * f) / f; };
const normalizar = (s) => String(s || '').trim().toLowerCase();
const lista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : [])).filter(Boolean);
const clonar = (obj) => JSON.parse(JSON.stringify(obj || {}));

// Personagem de jogador pelo nome (exato, depois sem maiúsculas, depois parcial único).
export function resolverPersonagem(estado, nome) {
    const meuNome = estado.meuNome || '';
    const alvo = normalizar(nome);
    if (!alvo || alvo === normalizar(meuNome)) return estado.minhaFicha ? { nome: meuNome, ficha: estado.minhaFicha } : null;
    const todos = Object.entries(estado.personagens || {}).filter(([, f]) => f && typeof f === 'object');
    const exato = todos.find(([n]) => normalizar(n) === alvo);
    if (exato) return { nome: exato[0], ficha: exato[1] };
    const parciais = todos.filter(([n]) => normalizar(n).includes(alvo));
    if (parciais.length === 1) return { nome: parciais[0][0], ficha: parciais[0][1] };
    return null;
}

function podeVerDetalhes(estado, nome) {
    return !!estado.isMestre || normalizar(nome) === normalizar(estado.meuNome);
}

function resumoVital(ficha, k) {
    if (!ficha?.[k]) return null;
    let teto = 0;
    try { teto = num(getTetoExibidoComFator(k, ficha)); } catch (e) { teto = 0; }
    const atualBruto = ficha[k].atual === undefined ? teto : num(ficha[k].atual);
    return {
        atual: Math.floor(atualBruto / FATOR_EXIBICAO_VITAIS),
        maximo: Math.floor(teto / FATOR_EXIBICAO_VITAIS),
        porcentagem: teto > 0 ? arred(Math.min(100, Math.max(0, (atualBruto / teto) * 100))) : 0,
    };
}

function prestigioDaCategoria(ficha, cat) {
    if (cat === 'status') return Math.floor(num(ficha?.statusPrestigioAplicado));
    // Mesma leitura de getBasePFor (Ficha Def/Marcados.jsx): getRawBase aceita bases salvas como texto.
    const div = num(ficha?.divisores?.[cat]) || 1;
    return Math.floor((num(getRawBase(ficha, cat)) / (MULTS_BASE_PRESTIGIO[cat] || 1)) * div) || 0;
}

function poderDe(ficha, estado) {
    try { return calcularPoderAtual(ficha, estado.divisorPoderMesa).poderGlobal; } catch (e) { return 0; }
}

// Ficha completa (dono ou Mestre).
export function resumoFichaDetalhado(nome, ficha, estado) {
    const bio = ficha.bio || {};
    const vitais = {};
    VITAIS.forEach((k) => { const r = resumoVital(ficha, k); if (r) vitais[k] = r; });
    const prestigio = {};
    CATEGORIAS_PRESTIGIO.forEach((cat) => { prestigio[cat] = prestigioDaCategoria(ficha, cat); });
    let supressao = num(ficha.supressaoPoder);
    if (ficha.supressaoPoder === undefined || ficha.supressaoPoder === '') supressao = 100;
    const inventario = lista(ficha.inventario);
    const poderes = lista(ficha.poderes);
    return {
        nome,
        raca: bio.raca || 'N/A',
        classe: bio.classe || 'N/A',
        poderCalculado: poderDe(ficha, estado),
        supressaoPoder: arred(supressao),
        fadigaPorcentagem: arred(calcularFadigaAtual(ficha)),
        ascensaoBase: parseInt(ficha.ascensaoBase, 10) || 1,
        vitais,
        prestigio,
        pontosPrestigioDisponiveis: getPontosPrestigioDisponiveis(ficha),
        iniciativa: num(ficha.iniciativa),
        formasAtivas: poderes.filter(p => p.ativa && normalizar(p.categoria) === 'forma').map(p => p.nome),
        poderesAtivos: poderes.filter(p => p.ativa && normalizar(p.categoria) !== 'forma').map(p => p.nome),
        armasEquipadas: inventario.filter(i => i.equipado && i.tipo === 'arma').map(i => i.nome),
        magiasPreparadas: lista(ficha.ataquesElementais).filter(m => m.equipado).map(m => `${m.nome} (${m.elemento || 'Neutro'})`),
    };
}

// O que qualquer jogador pode ver de outro personagem.
function resumoFichaPublico(nome, ficha) {
    const bio = ficha.bio || {};
    const vida = resumoVital(ficha, 'vida');
    return { nome, raca: bio.raca || 'N/A', classe: bio.classe || 'N/A', vidaPorcentagem: vida ? vida.porcentagem : null, observacao: 'Só dados públicos: a ficha completa de outro personagem é exclusiva do dono e do Mestre.' };
}

function resumoDummie(id, d, isMestre) {
    const hpMax = num(d.hpMax);
    const pct = hpMax > 0 ? arred(Math.min(100, Math.max(0, (num(d.hpAtual) / hpMax) * 100))) : null;
    if (!isMestre) return { nome: d.nome || id, tipo: 'NPC', vidaPorcentagem: pct };
    return {
        nome: d.nome || id, tipo: 'NPC', vidaPorcentagem: pct,
        vidaAtual: Math.floor(num(d.hpAtual) / FATOR_EXIBICAO_VITAIS), vidaMaxima: Math.floor(hpMax / FATOR_EXIBICAO_VITAIS),
        iniciativa: num(d.iniciativa),
    };
}

export function resumirEventoFeed(e) {
    if (!e || typeof e !== 'object') return null;
    const partes = [`[${e.tipo || 'evento'}] ${e.nome || '?'}`];
    if (e.texto) partes.push(String(e.texto));
    if (e.nomeTeste) partes.push(`teste: ${e.nomeTeste}`);
    if (e.armaStr) partes.push(`com ${e.armaStr}`);
    if (e.alvoNome) partes.push(`alvo: ${e.alvoNome}`);
    if (e.total !== undefined) partes.push(`total: ${e.total}`);
    if (e.acertoTotal !== undefined) partes.push(`acerto: ${e.acertoTotal}`);
    if (e.dano !== undefined) partes.push(`dano: ${e.dano}`);
    if (e.acertouAlvo !== undefined) partes.push(e.acertouAlvo ? 'ACERTOU' : 'ERROU');
    return partes.join(' | ').substring(0, 300);
}

function trechosComTermo(capitulos, termo, rotulo) {
    const alvo = normalizar(termo);
    const achados = [];
    lista(capitulos).forEach((cap) => lista(cap.arcos).forEach((arco) => {
        String(arco.texto || '').split('\n').forEach((linha) => {
            if (linha.trim().length > 3 && normalizar(linha).includes(alvo)) {
                achados.push(`(${rotulo} > ${cap.titulo} > ${arco.titulo}) ${linha.trim()}`);
            }
        });
    }));
    return achados;
}

// ---------- execução ----------
// `estado`: { meuNome, isMestre, minhaFicha, personagens, dummies, resumoTurnoMapa, cenario,
//             feedCombate, divisorPoderMesa, capitulosPresente, capitulosFuturo, podeVerFuturo }
// (podeVerFuturo: Mestre, ou jogador com Registros só dele, não compartilhados pela mesa)
// `carregarArvore`: função async opcional que devolve a Árvore da mesa ({ familia: [membros] }).
// `carregarTranscricoes(desdeMs)`: async, devolve [{ timestamp, autor, texto, tipo }].
// `memorizar({ texto, soMestre })`: async, grava um fato na memória da mesa (só chamada pro Mestre).
export async function executarFerramenta(nomeFerramenta, args, estado, { carregarArvore, carregarTranscricoes, memorizar } = {}) {
    const a = args || {};
    try {
        switch (nomeFerramenta) {
            case 'listar_personagens': {
                const jogadores = [];
                if (estado.minhaFicha && estado.meuNome) jogadores.push(estado.meuNome);
                Object.keys(estado.personagens || {}).forEach((n) => { if (normalizar(n) !== normalizar(estado.meuNome)) jogadores.push(n); });
                const npcs = Object.entries(estado.dummies || {}).filter(([, d]) => d && typeof d === 'object').map(([id, d]) => resumoDummie(id, d, estado.isMestre));
                return { voceE: estado.meuNome, papel: estado.isMestre ? 'Mestre' : 'Jogador', jogadores, npcs };
            }
            case 'consultar_ficha': {
                const achado = resolverPersonagem(estado, a.nome);
                if (!achado) {
                    const dummie = Object.entries(estado.dummies || {}).find(([id, d]) => normalizar(d?.nome || id) === normalizar(a.nome));
                    if (dummie) return resumoDummie(dummie[0], dummie[1], estado.isMestre);
                    return { erro: `Não encontrei o personagem "${a.nome || 'de quem pergunta'}". Use listar_personagens para ver os nomes.` };
                }
                return podeVerDetalhes(estado, achado.nome)
                    ? resumoFichaDetalhado(achado.nome, achado.ficha, estado)
                    : resumoFichaPublico(achado.nome, achado.ficha);
            }
            case 'estado_combate': {
                const ordem = lista(estado.resumoTurnoMapa?.ordem);
                const cenario = estado.cenario || {};
                const cena = cenario.lista?.[cenario.ativa]?.nome || cenario.ativa || 'desconhecida';
                if (ordem.length === 0) return { cena, emCombate: false, mensagem: 'Nenhum combate em andamento na cena exibida do Mapa.' };
                const idx = ((Math.floor(num(estado.resumoTurnoMapa?.turnoAtualIndex)) % ordem.length) + ordem.length) % ordem.length;
                return {
                    cena, emCombate: true,
                    vezDe: ordem[idx]?.nome,
                    proximo: ordem[(idx + 1) % ordem.length]?.nome,
                    ordemDeTurno: ordem.map((e, i) => ({ posicao: i + 1, nome: e.nome, iniciativa: e.iniciativa, npc: !!e.isDummie })),
                };
            }
            case 'feed_recente': {
                const qtd = Math.min(LIMITE_FEED, Math.max(1, Math.floor(num(a.quantidade)) || 15));
                const eventos = lista(estado.feedCombate).slice(-qtd).map(resumirEventoFeed).filter(Boolean);
                return { eventos, total: eventos.length };
            }
            case 'buscar_lore': {
                const termo = String(a.termo || '').trim();
                if (!termo) return { erro: 'Informe um termo para buscar.' };
                let trechos = trechosComTermo(estado.capitulosPresente, termo, 'Presente');
                if (estado.podeVerFuturo) trechos = trechos.concat(trechosComTermo(estado.capitulosFuturo, termo, 'Futuro'));
                let texto = '';
                const usados = [];
                for (const t of trechos) {
                    if (texto.length + t.length > LIMITE_TEXTO_LORE) break;
                    texto += `${t}\n`; usados.push(t);
                }
                return usados.length ? { termo, trechos: usados, totalEncontrado: trechos.length } : { termo, trechos: [], mensagem: 'Nada encontrado nos Registros.' };
            }
            case 'buscar_arvore': {
                if (typeof carregarArvore !== 'function') return { erro: 'Árvore Genealógica indisponível.' };
                const arvore = (await carregarArvore()) || {};
                const familias = Object.keys(arvore);
                const termo = normalizar(a.termo);
                if (!termo) return { familias };
                const membros = [];
                familias.forEach((fam) => lista(arvore[fam]).forEach((m) => {
                    const campos = [m.nome, m.papel, m.classe, m.elemento, m.afiliacao, m.parceiros, fam].map(normalizar).join(' ');
                    if (campos.includes(termo)) {
                        membros.push({ familia: fam, nome: m.nome, papel: m.papel, classe: m.classe, elemento: m.elemento, status: m.status, parceiros: m.parceiros, afiliacao: m.afiliacao, lore: String(m.lore || '').substring(0, 500) });
                    }
                }));
                return membros.length ? { termo: a.termo, encontrados: membros.slice(0, 20) } : { termo: a.termo, encontrados: [], familias };
            }
            case 'transcricoes_recentes': {
                if (typeof carregarTranscricoes !== 'function') return { erro: 'Transcrições indisponíveis.' };
                const horas = Math.min(48, Math.max(0.5, num(a.horas) || 6));
                const desde = Date.now() - horas * 3600000;
                const termo = normalizar(a.termo);
                const falas = lista(await carregarTranscricoes(desde))
                    .filter(t => t && t.texto && num(t.timestamp) >= desde)
                    .filter(t => !termo || normalizar(`${t.autor} ${t.texto}`).includes(termo))
                    .sort((x, y) => num(x.timestamp) - num(y.timestamp))
                    .slice(-80)
                    .map(t => `${t.autor || '?'}${t.tipo === 'npc' ? ' (NPC)' : ''}: "${String(t.texto).trim().substring(0, 300)}"`);
                return falas.length ? { horas, falas } : { horas, falas: [], mensagem: 'Nenhuma fala transcrita nesse período.' };
            }
            case 'memorizar_fato': {
                if (!estado.isMestre) return { erro: 'Só o Mestre pode gravar fatos na memória da mesa.' };
                if (typeof memorizar !== 'function') return { erro: 'Memória indisponível.' };
                const texto = String(a.texto || '').trim().substring(0, 500);
                if (!texto) return { erro: 'Nada para memorizar.' };
                await memorizar({ texto, soMestre: !!a.soMestre });
                return { ok: true, memorizado: texto, soMestre: !!a.soMestre };
            }
            case 'simular_prestigio': {
                const cat = normalizar(a.categoria);
                if (!VITAIS.includes(cat)) return { erro: 'A simulação funciona para vida, mana, aura, chakra ou corpo. Status usa o pool de pontos da Ficha.' };
                const pontos = Math.floor(num(a.pontos));
                if (pontos === 0) return { erro: 'Informe quantos pontos simular.' };
                const achado = resolverPersonagem(estado, a.nome);
                if (!achado) return { erro: `Não encontrei o personagem "${a.nome || 'de quem pergunta'}".` };
                if (!podeVerDetalhes(estado, achado.nome)) return { erro: 'Jogadores só podem simular o próprio personagem.' };
                const copia = clonar(achado.ficha);
                const antes = prestigioDaCategoria(copia, cat);
                const depois = Math.max(0, antes + pontos);
                if (!copia[cat]) copia[cat] = {};
                copia[cat].base = calcularBaseDoPrestigio(cat, depois, copia.divisores?.[cat]);
                const poderAntes = poderDe(achado.ficha, estado);
                const poderDepois = poderDe(copia, estado);
                const avisos = [];
                if (depois > PRESTIGIO_PARA_ASCENDER) avisos.push(`Jogadores não passam de ${PRESTIGIO_PARA_ASCENDER} por categoria; acima disso, só o Mestre.`);
                if (pontos > getPontosPrestigioDisponiveis(achado.ficha)) avisos.push(`O personagem só tem ${getPontosPrestigioDisponiveis(achado.ficha)} ponto(s) disponível(is) agora.`);
                return { nome: achado.nome, categoria: cat, prestigioAntes: antes, prestigioDepois: depois, poderAntes, poderDepois, ganhoDePoder: poderDepois - poderAntes, avisos };
            }
            case 'projetar_fadiga': {
                const achado = resolverPersonagem(estado, a.nome);
                if (!achado) return { erro: `Não encontrei o personagem "${a.nome || 'de quem pergunta'}".` };
                if (!podeVerDetalhes(estado, achado.nome)) return { erro: 'Jogadores só podem projetar a Fadiga do próprio personagem.' };
                const copia = clonar(achado.ficha);
                if (a.supressao !== undefined && a.supressao !== null && a.supressao !== '') copia.supressaoPoder = Math.min(100, Math.max(1, num(a.supressao)));
                if (!copia.combate) copia.combate = {};
                const turnos = Math.min(LIMITE_TURNOS_PROJECAO, Math.max(1, Math.floor(num(a.turnos)) || 10));
                const alvo = a.fadigaAlvo !== undefined && a.fadigaAlvo !== null && a.fadigaAlvo !== '' ? num(a.fadigaAlvo) : null;
                const porTurno = [];
                let turnosAteAlvo = alvo !== null && calcularFadigaAtual(copia) >= alvo ? 0 : null;
                const limite = alvo !== null ? LIMITE_TURNOS_PROJECAO : turnos;
                for (let t = 1; t <= limite; t++) {
                    const ganho = calcularGanhoFadigaDinamico(copia, { incluirEsforcoPoder: true });
                    copia.combate.fadigaExtra = Math.min(100, Math.max(0, num(copia.combate.fadigaExtra) + ganho));
                    const f = calcularFadigaAtual(copia);
                    if (t <= turnos) porTurno.push({ turno: t, ganho: arred(ganho, 2), fadiga: arred(f, 2) });
                    if (alvo !== null && turnosAteAlvo === null && f >= alvo) turnosAteAlvo = t;
                    if (t >= turnos && (alvo === null || turnosAteAlvo !== null)) break;
                }
                return {
                    nome: achado.nome,
                    supressao: arred(num(copia.supressaoPoder === undefined ? 100 : copia.supressaoPoder)),
                    fadigaInicial: arred(calcularFadigaAtual(achado.ficha), 2),
                    porTurno,
                    poderAposProjecao: poderDe(copia, estado),
                    ...(alvo !== null ? { fadigaAlvo: alvo, turnosAteAlvo: turnosAteAlvo === null ? `mais de ${LIMITE_TURNOS_PROJECAO}` : turnosAteAlvo } : {}),
                    observacao: 'Supõe Vida/Energias e Formas como estão agora. Não conta a Regeneração de turno (que reduz a Fadiga de quem regenera) nem danos futuros, então o valor real tende a ser igual ou menor.',
                };
            }
            default:
                return { erro: `Ferramenta desconhecida: ${nomeFerramenta}` };
        }
    } catch (err) {
        return { erro: `Falha ao consultar os dados (${err?.message || 'erro desconhecido'}).` };
    }
}

// Contexto inicial (vai na instrução de sistema): quem fala, papel, e a ficha dele já calculada.
export function montarContextoInicial(estado) {
    const papel = estado.isMestre ? 'Mestre (vê tudo da mesa)' : 'Jogador (vê a própria ficha completa e só o público dos outros)';
    const linhas = [`Quem fala: ${estado.meuNome || 'Desconhecido'}`, `Papel: ${papel}`];
    if (estado.minhaFicha) {
        linhas.push(`Ficha de quem fala (calculada pelo motor): ${JSON.stringify(resumoFichaDetalhado(estado.meuNome, estado.minhaFicha, estado))}`);
    }
    return linhas.join('\n');
}
