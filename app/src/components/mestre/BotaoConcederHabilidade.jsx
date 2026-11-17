import React, { useCallback, useId, useState } from 'react';
import DialogoTematico from '../shared/DialogoTematico';
import { confirmarExcecaoRaca } from '../shared/ConfirmarExcecaoRaca';
import { concederHabilidade } from '../../services/bibliotecaRacial';

// ✨ "Conceder" uma Habilidade da biblioteca a UM personagem (só Mestre/Co-Mestre; quem chama já filtra por isMestre).
// Abre um diálogo temático com "Conceder já bloqueada (ainda não despertou)" e "Requisito para desbloquear" (pré-preenchido com o da entrada).
// Sem Raça com acesso: depois de confirmar o diálogo, pede a confirmação de EXCEÇÃO (mesmo diálogo dos outros fluxos). `aoResultado(r)` recebe { ok, mensagem }.
// entidade = { id, nome, isDummie }; entrada = { id, nome, requisito }.
export default function BotaoConcederHabilidade({ entrada, entidade, rotulo = '✨ Conceder', aoResultado, comoExcecao = false }) {
    const [aberto, setAberto] = useState(false);
    const [bloqueada, setBloqueada] = useState(false);
    const [requisito, setRequisito] = useState('');
    const idBloqueada = useId();
    const idRequisito = useId();

    const abrir = useCallback(() => { setBloqueada(false); setRequisito(entrada.requisito || ''); setAberto(true); }, [entrada.requisito]);
    const fechar = useCallback(() => setAberto(false), []);

    const confirmar = useCallback(async () => {
        setAberto(false);
        const opcoes = { bloqueada, requisito };
        let r = concederHabilidade(entidade, entrada.id, opcoes);
        if (!r.ok && r.precisaExcecao) {
            const ok = await confirmarExcecaoRaca({ mensagem: r.mensagem, nomePoder: entrada.nome });
            if (!ok) { if (aoResultado) aoResultado({ ok: false, mensagem: 'Concessão cancelada.' }); return; }
            r = concederHabilidade(entidade, entrada.id, { ...opcoes, excecaoConfirmada: true });
        }
        if (aoResultado) {
            aoResultado(r.ok
                ? { ok: true, mensagem: `${entidade.nome} recebeu "${entrada.nome}"${r.excecao ? ' como exceção' : ''}${bloqueada ? ' (bloqueada)' : ''}${r.dominioInsuficiente ? '. Domínio insuficiente: ela fica bloqueada até o percentual subir' : ''}.` }
                : { ok: false, mensagem: r.mensagem || 'Não foi possível conceder.' });
        }
    }, [bloqueada, requisito, entidade, entrada, aoResultado]);

    return (
        <>
            <button type="button" className={`btn-neon ${comoExcecao ? '' : 'btn-gold '}biblioteca-conceder`.trim()} onClick={abrir}
                aria-label={`Conceder ${entrada.nome} a ${entidade.nome}${comoExcecao ? ' como exceção' : ''}`}>{rotulo}</button>
            {aberto && (
                <DialogoTematico titulo={`✨ Conceder "${entrada.nome}"`} aoFechar={fechar}
                    descricao={`${entidade.nome} recebe uma cópia desta Habilidade de Raça. Editar a biblioteca depois não muda a cópia dele.`}
                    acoes={(
                        <>
                            <button type="button" className="btn-neon" onClick={fechar}>Cancelar</button>
                            <button type="button" className="btn-neon btn-gold" onClick={confirmar}>Confirmar</button>
                        </>
                    )}>
                    <label className="biblioteca-dialogo-check" htmlFor={idBloqueada}>
                        <input id={idBloqueada} type="checkbox" checked={bloqueada} data-foco-inicial onChange={(ev) => setBloqueada(ev.target.checked)} />
                        <span>Conceder já bloqueada (ainda não despertou)</span>
                    </label>
                    <label className="biblioteca-dialogo-campo" htmlFor={idRequisito}>Requisito para desbloquear
                        <input id={idRequisito} type="text" maxLength={300} className="input-neon" value={requisito} onChange={(ev) => setRequisito(ev.target.value)} />
                    </label>
                </DialogoTematico>
            )}
        </>
    );
}
