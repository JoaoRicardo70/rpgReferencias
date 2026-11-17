import React, { useCallback, useId, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import DialogoTematico from '../shared/DialogoTematico';
import { publicarNaBiblioteca, entradaExistenteParaPoder } from '../../services/bibliotecaRacial';
import { LIMITE_NOME_BIBLIOTECA, LIMITE_RESUMO_BIBLIOTECA, LIMITE_REQUISITO_BIBLIOTECA, ICONE_BIBLIOTECA_PADRAO, LIMITE_ICONE_INPUT } from '../../core/bibliotecaRacial';
import { racasComAcessoTexto, percentualMinimoDoPoder } from '../../core/racas';

// 📚 "Publicar na biblioteca" no cartão de uma Habilidade de Raça (SÓ Mestre/Co-Mestre; quem renderiza já filtra por isMestre).
// O diálogo pede nome, resumo e ícone da entrada e mostra as Raças com acesso e o percentual mínimo do cartão (editáveis no cartão).
// Se a biblioteca já tem uma entrada para este poder (origemBiblioteca ou mesmo nome), oferece "Atualizar a entrada existente".
export default function PublicarNaBiblioteca({ poder }) {
    const cenario = useStore(s => s.cenario);
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const [resumo, setResumo] = useState('');
    const [icone, setIcone] = useState(ICONE_BIBLIOTECA_PADRAO);
    const [requisito, setRequisito] = useState('');
    const [mensagem, setMensagem] = useState(null);
    const idNome = useId(); const idResumo = useId(); const idIcone = useId(); const idRequisito = useId();

    const existente = useMemo(() => entradaExistenteParaPoder(cenario, poder), [cenario, poder]);

    const abrir = useCallback(() => {
        setMensagem(null);
        setNome(existente ? existente.nome : (poder.nome || ''));
        setResumo(existente ? existente.resumo : String(poder.descricao || '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_RESUMO_BIBLIOTECA));
        setIcone(existente ? existente.icone : ICONE_BIBLIOTECA_PADRAO);
        setRequisito(existente ? existente.requisito : ((poder.bloqueio && poder.bloqueio.requisito) || ''));
        setAberto(true);
    }, [existente, poder]);
    const fechar = useCallback(() => setAberto(false), []);

    const enviar = useCallback((atualizar) => {
        const r = publicarNaBiblioteca(poder, { nome, resumo, icone, requisito, ...(atualizar && existente ? { atualizarId: existente.id } : {}) });
        setAberto(false);
        setMensagem(r.ok
            ? { ok: true, texto: r.atualizada ? `Entrada "${r.entrada.nome}" atualizada na biblioteca.` : `"${r.entrada.nome}" publicada na biblioteca (aba 🧬 Raças do Painel do Mestre).${r.aviso ? ` ${r.aviso}` : ''}` }
            : { ok: false, texto: r.mensagem || 'Não foi possível publicar.' });
    }, [poder, nome, resumo, icone, requisito, existente]);

    const minimo = percentualMinimoDoPoder(poder);
    return (
        <div className="biblioteca-publicar">
            <button type="button" className="btn-neon grimorio-btn grimorio-btn--sm" onClick={abrir} aria-label={`Publicar ${poder.nome || 'habilidade'} na biblioteca`}>📚 Publicar na biblioteca</button>
            {mensagem && <p className={`composicao-mensagem${mensagem.ok ? '' : ' composicao-mensagem--erro'}`} role="status">{mensagem.texto}</p>}
            {aberto && (
                <DialogoTematico titulo="📚 Publicar na biblioteca" aoFechar={fechar}
                    descricao={existente
                        ? `Já existe "${existente.nome}" na biblioteca para esta habilidade. Atualizar substitui o modelo; as cópias já concedidas não mudam.`
                        : 'A biblioteca da mesa guarda um modelo desta habilidade para você conceder aos personagens das Raças com acesso.'}
                    acoes={(
                        <>
                            <button type="button" className="btn-neon" onClick={fechar}>Cancelar</button>
                            {existente && <button type="button" className="btn-neon btn-gold" onClick={() => enviar(true)} disabled={!nome.trim()}>Atualizar a entrada existente</button>}
                            {!existente && <button type="button" className="btn-neon btn-gold" onClick={() => enviar(false)} disabled={!nome.trim()}>Publicar</button>}
                        </>
                    )}>
                    <label className="biblioteca-dialogo-campo" htmlFor={idNome}>Nome
                        <input id={idNome} type="text" className="input-neon" data-foco-inicial maxLength={LIMITE_NOME_BIBLIOTECA} value={nome} onChange={(ev) => setNome(ev.target.value)} />
                    </label>
                    <label className="biblioteca-dialogo-campo" htmlFor={idResumo}>Resumo
                        <input id={idResumo} type="text" className="input-neon" maxLength={LIMITE_RESUMO_BIBLIOTECA} value={resumo} onChange={(ev) => setResumo(ev.target.value)} />
                    </label>
                    <label className="biblioteca-dialogo-campo" htmlFor={idIcone}>Ícone
                        <input id={idIcone} type="text" className="input-neon equipes-input-icone" maxLength={LIMITE_ICONE_INPUT} value={icone} onChange={(ev) => setIcone(ev.target.value)} />
                    </label>
                    <label className="biblioteca-dialogo-campo" htmlFor={idRequisito}>Requisito para desbloquear (opcional)
                        <input id={idRequisito} type="text" className="input-neon" maxLength={LIMITE_REQUISITO_BIBLIOTECA} value={requisito} onChange={(ev) => setRequisito(ev.target.value)} />
                    </label>
                    <p className="biblioteca-dica">Raças com acesso: {racasComAcessoTexto(cenario, poder)}. Percentual mínimo: {minimo > 0 ? `${minimo}%` : 'nenhum'}. (Edite no cartão ou na biblioteca.)</p>
                </DialogoTematico>
            )}
        </div>
    );
}
