// ==========================================
// DOMÍNIOS ELEMENTAIS (página 3 da Ficha, ficha.dominios) — leitura pura pra alimentar incentivos
// mecânicos ligados a Técnicas Elementais (poderes com vertente === 'Elemental'). Cada entrada de
// ficha.dominios[nome] = { nivel: 1-10, categoria } já existe e é editada na Hierarquia de
// Domínios; este módulo só LÊ o nível (nunca escreve) e transforma isso em números que
// core/fadiga.js e o disparo de ataque (PoderesFormContext.jsx > dispararAtaque) consomem.
// ==========================================

const NIVEL_MAX_DOMINIO = 10;

// Normaliza pra comparação: minúsculas, sem acento — a lista de Elementos das Técnicas
// (PoderesSubComponents.jsx) e a Lore de Domínios (Marcados.jsx > PREDEFINIDOS_LORE) já usam a
// mesma grafia na maioria dos nomes, mas isso protege contra pequenas divergências de acentuação
// (ex.: alguém digitando "Água" na Lore livre vs "Agua" no dropdown fixo de elemento).
// Remove marcas diacríticas (acentos) caractere a caractere pelo código Unicode (faixa dos
// "Combining Diacritical Marks", 0x0300-0x036F) depois de decompor a string com normalize('NFD') —
// evita embutir os próprios caracteres de acento como literais no código-fonte.
function normalizarNome(nome) {
    const decomposto = String(nome || '').trim().toLowerCase().normalize('NFD');
    let resultado = '';
    for (let i = 0; i < decomposto.length; i++) {
        const codigo = decomposto.charCodeAt(i);
        if (codigo < 0x0300 || codigo > 0x036f) resultado += decomposto[i];
    }
    return resultado;
}

// Nível bruto (0-10, clampado) do Domínio cujo nome bate com `nomeDominio` (comparação
// normalizada — case/acento-insensível) — 0 se o personagem nunca registrou esse Domínio na
// Hierarquia (página 3).
//
// ⚠️ ficha.dominios em fichaPadrao (useStore.js) nasce com um resíduo de uma estrutura antiga —
// chaves tipo "mana"/"chakra"/"aura"/"astral"/"marciais"/"armas"/"cura"/"summons"/"elementos"/
// "elementais" mapeadas pra OBJETOS VAZIOS ({}), não Domínios de verdade (que sempre têm .nivel
// definido). Ignoramos qualquer chave sem .nivel pra nunca deixar esse resíduo "roubar" a busca
// de um Domínio real que o jogador tenha criado com um nome parecido.
export function getNivelDominio(ficha, nomeDominio) {
    if (!ficha || !ficha.dominios || !nomeDominio) return 0;
    const alvo = normalizarNome(nomeDominio);
    const chave = Object.keys(ficha.dominios).find(k => {
        if (normalizarNome(k) !== alvo) return false;
        const entrada = ficha.dominios[k];
        return entrada && typeof entrada === 'object' && 'nivel' in entrada;
    });
    if (!chave) return 0;
    const nivel = parseFloat(ficha.dominios[chave]?.nivel);
    return isNaN(nivel) ? 0 : Math.min(NIVEL_MAX_DOMINIO, Math.max(0, nivel));
}

// 0 (nível 0, Domínio nunca treinado) a 1 (nível 10, "Eterno") — fração de domínio sobre o
// elemento, usada como fator de desconto/escala em todos os incentivos abaixo.
export function getFracaoDominio(ficha, nomeDominio) {
    return getNivelDominio(ficha, nomeDominio) / NIVEL_MAX_DOMINIO;
}

// 🥋 Peso máximo (pontos percentuais de Fadiga, mesma escala de PESO_MAX_DINAMICO_PADRAO em
// core/fadiga.js) que um disparo em OVERCHARGE de uma Técnica Elemental gera no pior caso
// (Domínio nível 0) — cada ponto de nível desconta 10% desse peso; nível 10 zera por completo.
// Aplicado como um ganho INSTANTÂNEO (não contínuo por turno, como as Formas) direto em
// combate.fadigaExtra no momento do disparo — ver PoderesFormContext.jsx > dispararAtaque.
const PESO_OVERCHARGE_ELEMENTAL = 10;

export function calcularGanhoFadigaOvercharge(ficha, nomeElemento) {
    try {
        if (!nomeElemento) return 0;
        const fracao = getFracaoDominio(ficha, nomeElemento);
        return Math.max(0, PESO_OVERCHARGE_ELEMENTAL * (1 - fracao));
    } catch (e) { return 0; }
}

// 🔻 Multiplicador de custo do Overcharge: 2.0x (Domínio nível 0/1, igual ao comportamento
// original, sem nenhum Domínio treinado) até 1.2x (nível 10, "Eterno") — dominar o elemento
// barateia GRADUALMENTE o preço de sobrecarregá-lo, em vez do salto fixo de sempre 2x.
const MULT_OVERCHARGE_SEM_DOMINIO = 2.0;
const MULT_OVERCHARGE_DOMINIO_MAX = 1.2;

export function calcularMultiplicadorOvercharge(ficha, nomeElemento) {
    const fracao = getFracaoDominio(ficha, nomeElemento);
    return MULT_OVERCHARGE_SEM_DOMINIO - fracao * (MULT_OVERCHARGE_SEM_DOMINIO - MULT_OVERCHARGE_DOMINIO_MAX);
}

// 🛡️ RESISTÊNCIA ELEMENTAL — fração de resistência (0-1) a aplicar por causa do ÚLTIMO golpe
// recebido (ficha.combate.ultimoElementoRecebido, setado pelo Dano Rápido do Mestre — ver
// MapaFormContext.jsx > aplicarDanoRapido). Normalmente é só getFracaoDominio(ficha, elemento) —
// o próprio nível de Domínio do ALVO nesse elemento. Mas o Mestre pode OVERRIDAR esse nível na
// hora de aplicar o golpe (campo "Nível de Domínio" no Dano Rápido, guardado em
// ficha.combate.ultimoElementoRecebidoNivel) — útil pra NPCs/criaturas sem Domínio registrado na
// própria Ficha, ou pra simular uma resistência pontual diferente da que o personagem tem
// registrada na Hierarquia. Um override de 0 é válido e distinto de "sem override" (null/
// undefined/string vazia) — 0 explicitamente zera a resistência mesmo que o alvo tenha um
// Domínio real mais alto.
export function getFracaoResistenciaElemental(ficha) {
    const elemento = ficha?.combate?.ultimoElementoRecebido;
    if (!elemento) return 0;
    const override = ficha?.combate?.ultimoElementoRecebidoNivel;
    if (override !== undefined && override !== null && override !== '') {
        const nivel = parseFloat(override);
        if (!isNaN(nivel)) return Math.min(NIVEL_MAX_DOMINIO, Math.max(0, nivel)) / NIVEL_MAX_DOMINIO;
    }
    return getFracaoDominio(ficha, elemento);
}
