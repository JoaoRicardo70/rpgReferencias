// ==========================================
// 🛡️ MECÂNICAS DE CLASSE — o que cada Classe faz no combate, definido EM CÓDIGO (e não mais só
// pelos "efeitos matemáticos" que o Mestre cadastra no Compêndio). Antes, o bônus de classe só
// existia se alguém tivesse salvo um override no Compêndio, e cada tela lia esse override de um
// lugar diferente: a mesma ficha podia ter Poder Calculado diferente na Ficha e no Mapa/combate.
//
// Tudo aqui é PURO (só lê a ficha) e sem imports do resto do core, pra attributes.js, poder.js,
// engine.js e disputaPoder.js poderem usar sem ciclo. Os números ajustáveis estão no topo: boa
// parte destes efeitos ainda está em teste e pode mudar.
//
// Resumo (os "x" são multiplicadores do Poder Calculado, ver core/poder.js):
//   Saber / Archer / Lancer: o "Mult Poder" da arma do tipo dela (Espada / Arma a Distância / Lança)
//                            VALE O DOBRO em si próprio; + Acerto e Vantagem usando essa arma.
//   Rider:      Poder x10 com a Montaria no campo (passivo pra Dragões); + Acerto e Vantagem.
//   Caster:     custo de Mana/Aura/Chakra menor; cada golpe de Conjuração (magia) causa dano como
//               se o Poder fosse x10 (só na Disputa de Poder do golpe, o Poder exibido não muda).
//   Assassin:   com a Presença Ocultada, o dano sai como se o Poder fosse x10.
//   Berserker:  a cada 10% de Vida perdida (o máximo já atingido NÃO volta ao curar) o Poder cresce,
//               de x1,5 a x20.
//   Ruler:      Vida x10.        Avenger: Poder x10.
//   Moon Cancer: usando algo do que ele é "arauto", dano como se o Poder fosse x10.
//   Foreigner:  em contato com o VAZIO, Poder x15.
//   Alter Ego / Pretender: usam a Classe de quem estão "vestindo" (bio.subClasse); trocar custa uma
//               Ação Bônus (ver FichaFormContext > mudarSubClasseDireto).
// ==========================================

export const MULT_AVENGER = 10;
export const MULT_RIDER_MONTADO = 10;
export const MULT_FOREIGNER_VAZIO = 15;
export const MULT_RULER_VIDA = 10;
export const MULT_GOLPE_CASTER = 10;
export const MULT_GOLPE_ASSASSIN = 10;
export const MULT_GOLPE_MOON_CANCER = 10;
export const MULT_BONUS_ARMA_DA_CLASSE = 2;

export const BONUS_ACERTO_CLASSE = 3;
export const VANTAGENS_DE_CLASSE = 1;
export const REDUCAO_CUSTO_CASTER = 20;

export const BERSERKER_PASSO_PCT = 10;
export const BERSERKER_FATOR_MINIMO = 1.5;
export const BERSERKER_FATOR_MAXIMO = 20;

// Classes que têm mecânica própria em código (o Compêndio não precisa mais cadastrá-las).
export const CLASSES_COM_MECANICA = ['saber', 'archer', 'lancer', 'rider', 'caster', 'assassin', 'berserker', 'ruler', 'avenger', 'mooncancer', 'foreigner'];

export function normalizarTexto(s) {
    return String(s === null || s === undefined ? '' : s).toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Classe que vale AGORA: Alter Ego / Pretender usam a Classe vestida (subClasse), se houver.
export function getClasseAtivaId(ficha) {
    const classe = normalizarTexto(ficha?.bio?.classe);
    const sub = normalizarTexto(ficha?.bio?.subClasse);
    if ((classe === 'alterego' || classe === 'pretender') && sub) return sub;
    return classe;
}

// ---------- Armas ----------
const ARMAS_A_DISTANCIA = ['arco', 'arma de fogo', 'besta', 'arco e flecha', 'pistola', 'rifle', 'fuzil', 'balestra'];
const CLASSE_DA_CATEGORIA_ARMA = { espada: 'saber', lanca: 'lancer', distancia: 'archer' };

// 'espada' | 'lanca' | 'distancia' | null — a partir do tipo da arma (item.armaTipo do Arsenal).
export function getCategoriaArma(armaTipo) {
    const t = normalizarTexto(armaTipo);
    if (!t) return null;
    if (t === 'espada') return 'espada';
    if (t === 'lanca') return 'lanca';
    if (ARMAS_A_DISTANCIA.includes(t)) return 'distancia';
    return null;
}

function tiposDeArmaDaClasse(classeId) {
    if (classeId === 'saber') return ['espada'];
    if (classeId === 'lancer') return ['lanca'];
    if (classeId === 'archer') return ARMAS_A_DISTANCIA;
    return [];
}

// A classe da ficha favorece ESTA arma? (Saber→Espada, Lancer→Lança, Archer→à Distância.)
export function classeFavoreceArma(ficha, armaTipo) {
    const categoria = getCategoriaArma(armaTipo);
    if (!categoria) return false;
    return getClasseAtivaId(ficha) === CLASSE_DA_CATEGORIA_ARMA[categoria];
}

// Quanto vale o "Mult Poder" (bonusTipo mult_dano) deste item: dobra pra a classe certa.
export function getMultiplicadorBonusArma(ficha, item) {
    if (!item || item.tipo === 'armadura') return 1;
    return classeFavoreceArma(ficha, item.armaTipo) ? MULT_BONUS_ARMA_DA_CLASSE : 1;
}

// ---------- Estados que o jogador/Mestre marca na Ficha ----------
export function racaDeDragao(ficha) {
    const r = normalizarTexto(ficha?.bio?.raca);
    return r.includes('dragao') || r.includes('dragon') || r.includes('draconi');
}

// Rider "montado": Montaria no campo (marcação da Ficha) ou Dragão (benefício passivo).
export function riderMontado(ficha) {
    if (getClasseAtivaId(ficha) !== 'rider') return false;
    return !!ficha?.combate?.montariaPresente || racaDeDragao(ficha);
}

export function foreignerNoVazio(ficha) {
    return getClasseAtivaId(ficha) === 'foreigner' && !!ficha?.combate?.contatoVazio;
}

export function assassinOcultando(ficha) {
    if (getClasseAtivaId(ficha) !== 'assassin') return false;
    const v = parseFloat(ficha?.ocultacaoPoder);
    return Number.isFinite(v) && v > 0;
}

export function ehBerserker(ficha) {
    return getClasseAtivaId(ficha) === 'berserker';
}

// ---------- Berserker ----------
// Degraus de BERSERKER_PASSO_PCT% de Vida perdida: o 1º vale x1,5 e o último (100%) x20, em escada.
export function calcularFatorBerserker(percPerdido) {
    const perc = Number(percPerdido);
    if (!Number.isFinite(perc) || perc <= 0) return 1;
    const totalDegraus = Math.round(100 / BERSERKER_PASSO_PCT);
    const degraus = Math.min(totalDegraus, Math.floor(perc / BERSERKER_PASSO_PCT));
    if (degraus <= 0) return 1;
    if (totalDegraus <= 1) return BERSERKER_FATOR_MAXIMO;
    const passo = (BERSERKER_FATOR_MAXIMO - BERSERKER_FATOR_MINIMO) / (totalDegraus - 1);
    return Math.round((BERSERKER_FATOR_MINIMO + passo * (degraus - 1)) * 1000) / 1000;
}

// O que o getBuffs soma no mgeral (o fator "x" vira ganho = fator - 1).
export function calcularGanhoBerserker(percPerdido) {
    return calcularFatorBerserker(percPerdido) - 1;
}

// ---------- Efeitos fixos (entram no getEfeitosDeClasse, e dali em getBuffs/Poder/Acerto) ----------
export function getEfeitosFixosDeClasse(ficha) {
    const classe = getClasseAtivaId(ficha);
    if (!classe) return [];
    const efeitos = [];
    const add = (atributo, propriedade, valor) => efeitos.push({ atributo, propriedade, valor, origemClasse: classe });

    if (classe === 'avenger') add('dano', 'munico', MULT_AVENGER);
    if (classe === 'ruler') add('vida', 'munico', MULT_RULER_VIDA);
    if (classe === 'rider' && riderMontado(ficha)) {
        add('dano', 'munico', MULT_RIDER_MONTADO);
    }
    if (classe === 'foreigner' && foreignerNoVazio(ficha)) add('dano', 'munico', MULT_FOREIGNER_VAZIO);
    if (classe === 'caster') ['mana', 'aura', 'chakra'].forEach(k => add(k, 'reducaocusto', REDUCAO_CUSTO_CASTER));
    if (classe === 'berserker') add('dano', 'furia_berserker', BERSERKER_FATOR_MINIMO);
    tiposDeArmaDaClasse(classe).forEach(tipo => add(tipo, 'proficiencia_arma', BONUS_ACERTO_CLASSE));
    return efeitos;
}

// Cópias dos efeitos que o Compêndio trazia (e que o Mestre pode ter SALVO como override) e que
// agora vêm do código — se continuassem valendo, contariam em dobro.
const EFEITOS_LEGADOS = {
    avenger: [{ atributo: 'dano', propriedade: 'munico', valor: 10 }, { atributo: 'todos_status', propriedade: 'munico', valor: 10 }],
    berserker: [{ atributo: 'dano', propriedade: 'furia_berserker', valor: 1.5 }, { atributo: 'todos_status', propriedade: 'furia_berserker', valor: 1.5 }]
};

// Tira de uma lista de efeitos de override os que são cópia do que o código já aplica.
export function removerEfeitosLegados(classeId, efeitos) {
    const legados = EFEITOS_LEGADOS[classeId];
    if (!legados || !Array.isArray(efeitos)) return efeitos || [];
    return efeitos.filter(e => !e || !legados.some(l =>
        normalizarTexto(e.atributo) === l.atributo && normalizarTexto(e.propriedade) === l.propriedade && parseFloat(e.valor) === l.valor));
}

// ---------- Acerto e Vantagem ----------
// Bônus de Acerto de classe que não depende da arma (Rider montado). O das armas vem de proficiencia_arma.
export function getBonusAcertoDeClasse(ficha) {
    return riderMontado(ficha) ? BONUS_ACERTO_CLASSE : 0;
}

// Vantagens extras de CLASSE num golpe com estas armas equipadas (tipos já normalizados).
export function getVantagensDeClasse(ficha, tiposArmasEquipadas = []) {
    const motivos = [];
    const classe = getClasseAtivaId(ficha);
    const alvos = tiposDeArmaDaClasse(classe);
    if (alvos.length > 0 && (tiposArmasEquipadas || []).some(t => alvos.includes(normalizarTexto(t)))) motivos.push(`Vantagem de ${classe.toUpperCase()} (arma da classe)`);
    if (riderMontado(ficha)) motivos.push('Vantagem de RIDER (montado)');
    return { vantagens: motivos.length > 0 ? VANTAGENS_DE_CLASSE : 0, motivos };
}

// ---------- Poder "no golpe" (Disputa de Poder) ----------
// Descreve o golpe a partir do que está EQUIPADO/ATIVO na ficha (o Ataque combina arma, magias e
// técnicas num só disparo): { conjuracao: usa magia ofensiva, textos: nomes/elementos pra comparar }.
export function golpeEquipado(ficha) {
    const textos = [];
    let conjuracao = false;
    const guardar = (...partes) => partes.forEach(p => { const n = normalizarTexto(p); if (n) textos.push(n); });
    (ficha?.inventario || []).forEach(i => { if (i && i.equipado && (i.tipo === 'arma' || i.tipo === 'artefato')) guardar(i.nome, i.armaTipo, i.elemento); });
    (ficha?.poderes || []).forEach(p => { if (p && p.ativa) guardar(p.nome, p.elemento); });
    (ficha?.ataquesElementais || []).forEach(m => {
        if (!m || !m.equipado || m.tipoMecanica === 'suporte') return;
        conjuracao = true;
        guardar(m.nome, m.elemento);
    });
    return { conjuracao, textos };
}

function golpeRelacionadoAoArauto(ficha, golpe) {
    if (ficha?.combate?.arautoAtivo) return true;
    const arauto = normalizarTexto(ficha?.bio?.arauto);
    if (!arauto) return false;
    return (golpe?.textos || []).some(t => t.includes(arauto) || (t.length >= 3 && arauto.includes(t)));
}

// Fator que multiplica o Poder do ATACANTE só pra Disputa deste golpe.
export function getFatorPoderDoGolpe(ficha, golpe) {
    const motivos = [];
    let fator = 1;
    const classe = getClasseAtivaId(ficha);
    if (classe === 'caster' && golpe && golpe.conjuracao) { fator *= MULT_GOLPE_CASTER; motivos.push('Conjuração (Caster)'); }
    if (classe === 'assassin' && assassinOcultando(ficha)) { fator *= MULT_GOLPE_ASSASSIN; motivos.push('Presença Ocultada (Assassin)'); }
    if (classe === 'mooncancer' && golpeRelacionadoAoArauto(ficha, golpe)) { fator *= MULT_GOLPE_MOON_CANCER; motivos.push('Arauto (Moon Cancer)'); }
    return { fator, motivos };
}

// ---------- Textos (Ficha e Compêndio mostram o MESMO resumo do que o código faz) ----------
export const MECANICA_CLASSE = {
    saber: `Espadas: o Mult Poder da Espada equipada vale o DOBRO (10x vira 20x). +${BONUS_ACERTO_CLASSE} de Acerto e Vantagem nos ataques com Espadas.`,
    archer: `Armas à Distância: o Mult Poder da arma à distância equipada vale o DOBRO (10x vira 20x). +${BONUS_ACERTO_CLASSE} de Acerto e Vantagem nos ataques com Armas à Distância.`,
    lancer: `Lanças: o Mult Poder da Lança equipada vale o DOBRO (10x vira 20x). +${BONUS_ACERTO_CLASSE} de Acerto e Vantagem nos ataques com Lanças.`,
    rider: `Com a Montaria no campo de batalha: Poder Calculado x${MULT_RIDER_MONTADO}, +${BONUS_ACERTO_CLASSE} de Acerto e Vantagem nos ataques. Dragões (e raças similares) têm isso de forma passiva.`,
    caster: `Gasta menos Mana, Aura e Chakra (-${REDUCAO_CUSTO_CASTER}% de custo). Cada golpe de Conjuração (magia) causa dano como se o Poder Calculado fosse x${MULT_GOLPE_CASTER}.`,
    assassin: `Com a Presença Ocultada, o dano sai como se o Poder Calculado fosse x${MULT_GOLPE_ASSASSIN} (além de poder Ocultar a Presença por completo).`,
    berserker: `A cada ${BERSERKER_PASSO_PCT}% de Vida perdida o Poder Calculado sobe (de x${BERSERKER_FATOR_MINIMO} a x${BERSERKER_FATOR_MAXIMO}). Curar NÃO tira o ganho: só crescendo com um dano maior que o já recebido.`,
    ruler: `Vida x${MULT_RULER_VIDA}.`,
    avenger: `Poder Calculado x${MULT_AVENGER}.`,
    mooncancer: `Todo Moon Cancer é arauto de algo. Usando algo relacionado ao que representa, o dano sai como se o Poder Calculado fosse x${MULT_GOLPE_MOON_CANCER}.`,
    foreigner: `Em contato com o VAZIO, Poder Calculado x${MULT_FOREIGNER_VAZIO}.`,
    alterego: 'Tem a Classe própria e a de um Ser Selado/Espírito/Pacto. Trocar a Classe equipada em combate gasta uma Ação Bônus.',
    pretender: 'Até um descanso longo, pode usar qualquer Classe que encontrou no dia. Trocar a Classe em combate gasta uma Ação Bônus.'
};
