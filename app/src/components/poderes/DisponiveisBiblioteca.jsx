import React, { useCallback, useMemo, useState } from 'react';
import BotaoConcederHabilidade from '../mestre/BotaoConcederHabilidade';
import { getBiblioteca, disponiveisParaJogador, disponivelParaFicha, textoDominio } from '../../core/bibliotecaRacial';
import { habilidadeRevelaRaca, VIEWER_OUTRO_JOGADOR } from '../../core/racasVisibilidade';
import { ID_CATEGORIA_HABILIDADE_RACA } from '../../core/racas';

// 📚 "Disponíveis para a sua Raça" (aba 🧬 Habilidades de Raça do Grimório). Lista as entradas da biblioteca da mesa com acesso pela Raça/composição
// do personagem que ele ainda NÃO possui: nome, resumo, "Domínio X% de Y%" (ou "Domínio suficiente") e o requisito de desbloqueio.
// Jogador: SOMENTE LEITURA, nunca vê entradas de outras Raças nem o `modelo` (só nome/resumo/requisito/percentual) — "Peça ao Mestre para receber".
// Mestre (Grimório do próprio ou de outra Entidade): a mesma lista com "✨ Conceder" daquele personagem + as entradas sem acesso pela Raça, concedíveis só como EXCEÇÃO.
// entidade = { id, nome } do dono da ficha exibida.
// 🙈 `viewer` (core/racasVisibilidade.js): para quem não vê a Raça que dá o acesso, a entrada some da lista (listá-la revelaria a Raça).
export default function DisponiveisBiblioteca({ cenario, ficha, entidade, isMestre, viewer = VIEWER_OUTRO_JOGADOR }) {
    const [mensagem, setMensagem] = useState(null);
    const aoResultado = useCallback((r) => setMensagem(r), []);

    const disponiveis = useMemo(() => {
        const lista = disponiveisParaJogador(cenario, ficha);
        if (isMestre || (viewer && viewer.souMestre)) return lista;
        const porId = new Map(getBiblioteca(cenario).map(e => [e.id, e]));
        return lista.filter((d) => {
            const e = porId.get(d.id);
            return !e || !habilidadeRevelaRaca(cenario, ficha, { categoria: ID_CATEGORIA_HABILIDADE_RACA, racasAcesso: e.racasAcesso, percentualMinimo: 0 }, viewer);
        });
    }, [cenario, ficha, isMestre, viewer]);
    // Só Mestre: o que o personagem ainda não tem e a Raça dele NÃO libera (conceder = exceção, com confirmação).
    const excecoes = useMemo(() => {
        if (!isMestre) return [];
        return getBiblioteca(cenario).filter((e) => {
            const s = disponivelParaFicha(cenario, ficha, e);
            return !s.disponivel && !s.jaPossui;
        });
    }, [isMestre, cenario, ficha]);
    const entradaPorId = useMemo(() => new Map(getBiblioteca(cenario).map(e => [e.id, e])), [cenario]);

    if (disponiveis.length === 0 && excecoes.length === 0 && !mensagem) return null;
    const nomeDono = entidade && entidade.nome ? entidade.nome : '';

    return (
        <section className="biblioteca-disponiveis" aria-label={isMestre ? `Habilidades de Raça disponíveis para ${nomeDono}` : 'Habilidades de Raça disponíveis para a sua Raça'}>
            <h4 className="biblioteca-subtitulo">{isMestre ? `📚 Disponíveis para a Raça de ${nomeDono}` : '📚 Disponíveis para a sua Raça'}</h4>
            {mensagem && <p className={`composicao-mensagem${mensagem.ok ? '' : ' composicao-mensagem--erro'}`} role="status">{mensagem.mensagem}</p>}
            {disponiveis.length > 0 && (
                <ul className="biblioteca-compativeis-lista">
                    {disponiveis.map((d) => (
                        <li key={d.id} className="biblioteca-compativel biblioteca-compativel--bloco">
                            <div className="biblioteca-cabecalho">
                                <span aria-hidden="true">{d.icone}</span> <strong className="biblioteca-nome">{d.nome}</strong>
                                <span className="biblioteca-compativel-dominio">{textoDominio(d.situacao)}</span>
                            </div>
                            {d.resumo && <p className="biblioteca-resumo">{d.resumo}</p>}
                            {d.requisito && <p className="bloqueio-raca-requisito">Para desbloquear: {d.requisito}</p>}
                            {isMestre && entradaPorId.get(d.id)
                                ? <BotaoConcederHabilidade entrada={entradaPorId.get(d.id)} entidade={entidade} aoResultado={aoResultado} />
                                : <p className="biblioteca-dica">Peça ao Mestre para receber.</p>}
                        </li>
                    ))}
                </ul>
            )}
            {isMestre && excecoes.length > 0 && (
                <>
                    <h5 className="biblioteca-subtitulo">Sem acesso pela Raça (só como exceção)</h5>
                    <ul className="biblioteca-compativeis-lista">
                        {excecoes.map((e) => (
                            <li key={e.id} className="biblioteca-compativel biblioteca-compativel--bloco">
                                <div className="biblioteca-cabecalho"><span aria-hidden="true">{e.icone}</span> <strong className="biblioteca-nome">{e.nome}</strong></div>
                                {e.resumo && <p className="biblioteca-resumo">{e.resumo}</p>}
                                <BotaoConcederHabilidade entrada={e} entidade={entidade} aoResultado={aoResultado} rotulo="✨ Conceder como exceção" comoExcecao />
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}
