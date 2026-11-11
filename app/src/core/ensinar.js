// ==========================================
// 🎓 ENSINAR — lógica pura. Um personagem oferece uma Habilidade/Forma/Poder ou Técnica a outro; a oferta fica em
// ficha.ensinamentos[id] do aluno e só vira cópia na ficha dele quando ele aceita. O professor escolhe o NÍVEL DE APRENDIZADO
// (0-100): em Habilidades/Formas/Poderes ele vira a Maestria inicial do aluno (o quanto já domina), então "aprender sem a
// capacidade máxima" é aprender com Maestria menor e treinar depois. Nada aqui fala com Firebase nem com a tela.
// ==========================================
import { temChaveInvalida, LIMITE_IMAGEM_NO_BACKUP } from './backupFicha';
import { poderEhCopiavel, usaMaestriaRequerida, ehCategoriaForma, idCategoriaPoder, mensagemCategoriaNaoLiberada, MENSAGEM_SINGULARIDADE_NAO_COPIA } from './categoriasPoder';

export const TIPO_PODER = 'poder';     // item de ficha.poderes (Habilidade, Forma ou Poder)
export const TIPO_TECNICA = 'tecnica'; // item de ficha.ataquesElementais

const limitarNivel = (v) => Math.min(100, Math.max(0, Math.round(parseFloat(v) || 0)));

// Cópia limpa do que será ensinado: sem id, sem estado de uso (ativa/equipado) e sem imagem embutida gigante.
export function prepararItemEnsinado(item) {
    const copia = JSON.parse(JSON.stringify(item || {}));
    delete copia.id;
    copia.ativa = false;
    copia.equipado = false;
    if (typeof copia.imagemUrl === 'string' && copia.imagemUrl.length > LIMITE_IMAGEM_NO_BACKUP && copia.imagemUrl.startsWith('data:')) copia.imagemUrl = '';
    return copia;
}

// Monta a oferta que será gravada na ficha do aluno. Devolve { ok, oferta } ou { ok: false, erro }.
export function montarOferta({ professor, tipo, item, nivel, agora = Date.now(), sorteio = Math.random }) {
    if (!professor) return { ok: false, erro: 'Sem personagem professor.' };
    if (tipo !== TIPO_PODER && tipo !== TIPO_TECNICA) return { ok: false, erro: 'Tipo de ensinamento inválido.' };
    if (!item || typeof item !== 'object' || !String(item.nome || '').trim()) return { ok: false, erro: 'Escolha algo com nome para ensinar.' };
    // Singularidade é impossível de copiar/ensinar (core/categoriasPoder.js).
    if (tipo === TIPO_PODER && !poderEhCopiavel(item)) return { ok: false, erro: MENSAGEM_SINGULARIDADE_NAO_COPIA };
    const copia = prepararItemEnsinado(item);
    if (temChaveInvalida(copia)) return { ok: false, erro: 'Isso tem campos com nomes que o servidor não aceita (. # $ [ ] /).' };
    const id = `ens_${agora}_${Math.floor(sorteio() * 1e6)}`;
    return { ok: true, id, oferta: { id, de: String(professor), tipo, nivel: limitarNivel(nivel), em: agora, item: copia } };
}

// Ofertas pendentes da ficha, da mais antiga para a mais nova.
export function ofertasRecebidas(ficha, tipo) {
    const mapa = ficha && ficha.ensinamentos;
    if (!mapa || typeof mapa !== 'object') return [];
    return Object.keys(mapa)
        .map(k => mapa[k])
        .filter(o => o && typeof o === 'object' && o.id && o.item && (!tipo || o.tipo === tipo))
        .sort((a, b) => (a.em || 0) - (b.em || 0));
}

// Texto de origem gravado na cópia ("Aprendido com X").
export function notaDeOrigem(oferta) {
    return `Aprendido com ${oferta.de}${oferta.tipo === TIPO_TECNICA ? ` (nível ${limitarNivel(oferta.nivel)}%)` : ''}`;
}

// Motivo de a oferta não poder ser aceita agora ('' = pode): categoria que exige liberação do Mestre e o aluno não tem.
// Singularidade é tratada à parte (nunca copia). A oferta NÃO é descartada: dá para aceitar depois da liberação.
export function motivoRecusaOferta(f, oferta) {
    if (!oferta || oferta.tipo !== TIPO_PODER || !oferta.item) return '';
    return mensagemCategoriaNaoLiberada(oferta.item, f);
}

// Cria, dentro de updateFicha (rascunho `f`), a cópia aprendida e tira a oferta. Devolve o item criado ou null.
export function aceitarOferta(f, oferta, novoId) {
    if (!f || !oferta || !oferta.item) return null;
    // Já aceita/recusada (duplo clique ou snapshot remoto): não duplica o item.
    if (!f.ensinamentos || !f.ensinamentos[oferta.id]) return null;
    // Oferta de Singularidade (vinda de fora): nunca vira cópia; a oferta é descartada.
    if (oferta.tipo === TIPO_PODER && !poderEhCopiavel(oferta.item)) { removerOferta(f, oferta.id); return null; }
    // Categoria ainda não liberada para o aluno: não cria nada e mantém a oferta pendente.
    if (motivoRecusaOferta(f, oferta)) return null;
    const item = JSON.parse(JSON.stringify(oferta.item));
    item.id = novoId;
    item.ensinadoPor = oferta.de;
    const origem = notaDeOrigem(oferta);
    item.notasIA = item.notasIA ? `${origem}. ${item.notasIA}` : origem;
    if (oferta.tipo === TIPO_PODER) {
        const nivel = limitarNivel(oferta.nivel);
        // Habilidade, Poder e as categorias especiais (Ocular/Infinity) ganham a Maestria inicial; Forma também.
        const cat = idCategoriaPoder(item.categoria);
        if (cat && (ehCategoriaForma(cat) || usaMaestriaRequerida(cat))) item.maestria = nivel;
        if (item.categoria === 'forma') item.fadigaPorUso = item.fadigaPorUso ?? 0;
        if (!f.poderes) f.poderes = [];
        f.poderes.push(item);
    } else {
        item.equipado = false;
        if (!f.ataquesElementais) f.ataquesElementais = [];
        f.ataquesElementais.push(item);
    }
    removerOferta(f, oferta.id);
    return item;
}

export function removerOferta(f, idOferta) {
    if (f && f.ensinamentos && typeof f.ensinamentos === 'object') {
        // Mantém {} quando esvazia: apagar o nó inteiro (null no Firebase) levaria junto uma oferta nova que chegou agora.
        delete f.ensinamentos[idOferta];
    }
}

// Quem pode receber: todos da mesa menos eu (as chaves de `personagens` já vêm sanitizadas).
export function alunosPossiveis(personagens, meuNomeSanitizado) {
    return Object.keys(personagens || {}).filter(k => k && k !== meuNomeSanitizado).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
