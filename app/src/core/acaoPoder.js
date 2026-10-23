// ==========================================
// ⚡ PODER CALCULADO E AÇÕES
//
// Regras da mesa (pedido do usuário), para a disputa de Poder Calculado em combate:
//   • Subir o Poder Calculado de 0% a 100% ("Restringir Poder" da Ficha) é uma AÇÃO LIVRE: pode ser feito a qualquer
//     momento, inclusive fora do próprio turno, e não gasta nada.
//   • Ligar Habilidade/Forma/Poder que impacta o Poder Calculado gasta uma REAÇÃO (a menos que a técnica diga outra coisa).
//   • Equipar Arma/item que impacta o Poder Calculado é Ação Livre ou Reação, conforme escolhido no item.
// Isso pesa quando o atacante elevou o próprio Poder: quem vai ser atacado pode responder subindo o Poder (livre), ligando
// técnicas ou equipando itens (Reação) antes do golpe cair.
// ==========================================
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { normalizarTipoAcao } from './acoesTecnica.js';

// Atributos de efeito que mexem no Poder Calculado (status, vitais/energias, multiplicadores de Dano e PODER Direto).
const ATRIBUTOS_DE_PODER = new Set([
    'forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao',
    'vida', 'mana', 'aura', 'chakra', 'corpo', 'dano', 'poder_direto', 'todos_status', 'todas_energias', 'geral'
]);
// Propriedades que não aumentam Poder (custo, regeneração, acerto, elemento inato).
const PROPRIEDADES_SEM_PODER = new Set(['reducaocusto', 'regeneracao', 'bonus_acerto', 'elemento_inato']);

const efeitoMexeNoPoder = (e) => {
    if (!e || typeof e.atributo !== 'string') return false;
    if (!ATRIBUTOS_DE_PODER.has(e.atributo.toLowerCase())) return false;
    if (PROPRIEDADES_SEM_PODER.has(String(e.propriedade || '').toLowerCase())) return false;
    const valor = parseFloat(e.valor);
    return Number.isFinite(valor) && valor !== 0;
};

// Esta técnica (Poder/Forma/Habilidade) ou item, ao ficar ativa/equipada, mexe no Poder Calculado?
// `incluirPassivos`: itens equipados valem também pelos efeitos passivos; técnica só pelos efeitos ativos (que ligam e desligam).
export function afetaPoderCalculado(entidade, { incluirPassivos = false } = {}) {
    if (!entidade) return false;
    if (entidade.bonusTipo === 'mult_dano' && parseFloat(entidade.bonusValor) > 0) return true;
    const resolvidos = resolverEfeitosEntidade(entidade);
    if ((resolvidos.efeitos || []).some(efeitoMexeNoPoder)) return true;
    return incluirPassivos && (resolvidos.efeitosPassivos || []).some(efeitoMexeNoPoder);
}

// Tipo de Ação que LIGAR a técnica cobra: o que o jogador escolheu na técnica; sem escolha, 'reacao' se ela eleva o Poder.
// (Quem quer ligar de graça escolhe "Ação Livre" na técnica.)
export function tipoAcaoAoLigar(tecnica) {
    const escolhido = normalizarTipoAcao(tecnica && tecnica.tipoAcao);
    if (escolhido) return escolhido;
    return afetaPoderCalculado(tecnica) ? 'reacao' : '';
}

export const ACOES_EQUIPAR_ITEM = [
    { id: 'livre', rotulo: 'Ação Livre' },
    { id: 'reacao', rotulo: 'Reação' }
];

export function normalizarAcaoEquipar(v) {
    return String(v ?? '').trim() === 'reacao' ? 'reacao' : 'livre';
}

// Equipar este item cobra uma Reação? Só quando ele eleva o Poder Calculado e foi marcado como Reação.
export function equiparCobraReacao(item) {
    return !!item && normalizarAcaoEquipar(item.equiparAcao) === 'reacao' && afetaPoderCalculado(item, { incluirPassivos: true });
}
