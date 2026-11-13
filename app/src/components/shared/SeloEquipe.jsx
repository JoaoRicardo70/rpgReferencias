import React from 'react';
import { getEquipe, equipeDe, ladoVisivelParaMim, ladoEstaOculto, ROTULO_LADO_OCULTO, ICONE_EQUIPE_PADRAO } from '../../core/lados';

// 🛡️ Selo pequeno da equipe de um combatente (ícone + cor). Para quem não é Mestre, um lado oculto vira "❓".
// `entidade` = item { ficha, isDummie } (ordem de iniciativa / alvos) ou ficha crua. A cor vai por variável CSS (valor dinâmico).
export default function SeloEquipe({ cenario, entidade, isMestre = false, comNome = false }) {
    if (!entidade) return null;
    if (!ladoVisivelParaMim(entidade, { isMestre })) {
        return (
            <span role="img" className="lado-selo lado-selo--oculto" title={ROTULO_LADO_OCULTO} aria-label={ROTULO_LADO_OCULTO} data-testid="lado-selo">
                <span aria-hidden="true">❓</span>{comNome && <span className="lado-selo-nome">Desconhecido</span>}
            </span>
        );
    }
    const id = equipeDe(entidade, cenario);
    const eq = getEquipe(cenario, id);
    const nome = eq ? eq.nome : id;
    const icone = (eq && eq.icone) || ICONE_EQUIPE_PADRAO;
    const oculto = ladoEstaOculto(entidade);
    const rotulo = `Equipe: ${nome}${oculto ? ' (lado oculto para os jogadores)' : ''}`;
    return (
        <span role="img" className={`lado-selo${oculto ? ' lado-selo--mestre-oculto' : ''}`} style={{ '--lado-cor': (eq && eq.cor) || undefined }} title={rotulo} aria-label={rotulo} data-testid="lado-selo">
            <span aria-hidden="true">{icone}</span>{comNome && <span className="lado-selo-nome">{nome}</span>}{oculto && <span aria-hidden="true" className="lado-selo-olho">🙈</span>}
        </span>
    );
}
