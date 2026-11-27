import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    definirBloqueioDoPoder, despertarHabilidade, definirPercentualMinimoDoPoder, definirManipulaDNA,
} from '../../services/composicaoRacial';
import { percentualMinimoDoPoder, racasQueDaoAcesso } from '../../core/racas';
import ComposicaoRacialEditor from '../mestre/ComposicaoRacialEditor';
import DialogoTematico from '../shared/DialogoTematico';
import { composicaoVisivel, racasDesconhecidasDoDono, habilidadeRevelaRaca, poderBloqueadoVisivel, habilidadeComRacaOcultaDoJogador, VIEWER_OUTRO_JOGADOR, ROTULO_RACA_OCULTA, AVISO_RACA_OCULTA_MESTRE } from '../../core/racasVisibilidade';

// 🧬 Peças do cartão do Grimório ligadas à Raça (core/racas.js + services/composicaoRacial.js):
//  - ResumoDominioRacial: cabeçalho da aba Habilidades de Raça ("Seu Domínio: Saiyajin 70% · Humano 30%").
//  - DominioHabilidadeRaca: requisito/Domínio da habilidade (todos veem) + controles do Mestre/Co-Mestre (percentual mínimo, bloqueio, despertar).
//  - DnaDoPoder: interruptor "Manipulação de DNA" do Mestre (qualquer categoria) e selo discreto "🧬 DNA" para o jogador.
// `entidade` = { id, nome } do dono da ficha exibida (o Grimório da Entidade do Mestre mira outro personagem).

// `viewer` = { souDono, souMestre } (core/racasVisibilidade.js): só as Raças que ele pode ver; o dono vê "❓ Raça desconhecida" no lugar das secretas. Sem viewer = o mais restrito (outro jogador).
export function ResumoDominioRacial({ cenario, ficha, viewer = VIEWER_OUTRO_JOGADOR }) {
    const composicao = useMemo(() => composicaoVisivel(cenario, ficha, viewer), [cenario, ficha, viewer]);
    const desconhecidas = useMemo(() => racasDesconhecidasDoDono(cenario, ficha, viewer), [cenario, ficha, viewer]);
    return (
        <div className="composicao-resumo" role="note">
            <p className="composicao-resumo-linha">
                🧬 Seu Domínio: {composicao.length === 0 && desconhecidas.length === 0 ? <em>sem Raça definida</em> : composicao.map((e, i) => (
                    <span key={e.racaId}>{i > 0 ? ' · ' : ''}<strong>{e.nome}</strong> {e.percentual}%</span>
                ))}
                {desconhecidas.map((e, i) => <span key={`oculta-${e.racaId}`}>{composicao.length + i > 0 ? ' · ' : ''}<strong>{ROTULO_RACA_OCULTA}</strong></span>)}
            </p>
            <p className="composicao-resumo-dica">Pratique para elevar o percentual e desbloquear mais Habilidades.</p>
        </div>
    );
}

export function DominioHabilidadeRaca({ poder, ficha, cenario, entidade, isMestre, viewer = VIEWER_OUTRO_JOGADOR }) {
    // 🙈 `bloqueio` e `revela` só mudam a EXIBIÇÃO (selo/motivo/Domínio); o bloqueio real continua em poderBloqueado.
    const bloqueio = poderBloqueadoVisivel(cenario, ficha, poder, viewer);
    const revela = habilidadeRevelaRaca(cenario, ficha, poder, viewer);
    const minimo = percentualMinimoDoPoder(poder);
    const manual = poder.bloqueio && poder.bloqueio.ativo === true;
    const [minimoTxt, setMinimoTxt] = useState(String(minimo));
    const [requisitoTxt, setRequisitoTxt] = useState((poder.bloqueio && poder.bloqueio.requisito) || '');
    const [motivoTxt, setMotivoTxt] = useState((poder.bloqueio && poder.bloqueio.motivo) || '');
    const [confirmando, setConfirmando] = useState(false);
    const [praticaAberta, setPraticaAberta] = useState(false);
    const [mensagem, setMensagem] = useState('');
    useEffect(() => { setMinimoTxt(String(minimo)); }, [minimo]);
    useEffect(() => { setRequisitoTxt((poder.bloqueio && poder.bloqueio.requisito) || ''); setMotivoTxt((poder.bloqueio && poder.bloqueio.motivo) || ''); }, [poder.bloqueio]);

    const aviso = useCallback((r, ok = '') => { setMensagem(r && r.ok ? ok : ((r && r.mensagem) || 'Não foi possível concluir.')); }, []);
    const gravarMinimo = useCallback(() => {
        const v = minimoTxt === '' ? 0 : Number(minimoTxt);
        if (v === minimo) return;
        aviso(definirPercentualMinimoDoPoder(entidade, poder.id, v), 'Percentual mínimo salvo.');
    }, [minimoTxt, minimo, entidade, poder.id, aviso]);
    const mudarBloqueio = useCallback((ativo) => {
        aviso(definirBloqueioDoPoder(entidade, poder.id, { ativo, requisito: requisitoTxt, motivo: motivoTxt }), ativo ? 'Habilidade bloqueada.' : 'Bloqueio removido.');
    }, [entidade, poder.id, requisitoTxt, motivoTxt, aviso]);
    const gravarTextosBloqueio = useCallback(() => {
        const atual = poder.bloqueio || {};
        if ((atual.requisito || '') === requisitoTxt && (atual.motivo || '') === motivoTxt) return;
        aviso(definirBloqueioDoPoder(entidade, poder.id, { ativo: atual.ativo === true, requisito: requisitoTxt, motivo: motivoTxt }), 'Bloqueio salvo.');
    }, [poder.bloqueio, requisitoTxt, motivoTxt, entidade, poder.id, aviso]);
    const despertar = useCallback(() => {
        setConfirmando(false);
        aviso(despertarHabilidade(entidade, poder.id), `${poder.nome || 'Habilidade'} despertou.`);
    }, [entidade, poder.id, poder.nome, aviso]);

    const dominio = racasQueDaoAcesso(cenario, ficha, poder, { ignorarPercentual: true });
    const melhor = dominio.length ? dominio.reduce((a, e) => (e.percentual > a.percentual ? e : a), dominio[0]) : null;
    const nomePoder = poder.nome || 'esta habilidade';

    return (
        <div className="bloqueio-raca">
            {minimo > 0 && melhor && !revela && <p className="bloqueio-raca-dominio">Domínio: {melhor.nome} {melhor.percentual}% (mínimo {minimo}%)</p>}
            {minimo > 0 && (!melhor || revela) && <p className="bloqueio-raca-dominio">Domínio mínimo exigido: {minimo}%</p>}
            {bloqueio.bloqueado && bloqueio.requisito && <p className="bloqueio-raca-requisito" role="note">Para desbloquear: {bloqueio.requisito}</p>}
            {manual && poder.bloqueio.motivo && <p className="bloqueio-raca-motivo">{poder.bloqueio.motivo}</p>}
            {bloqueio.bloqueado && bloqueio.origem === 'percentual' && <p className="bloqueio-raca-motivo">Esta habilidade sobe com a prática: eleve o percentual da Raça.</p>}

            {isMestre && habilidadeComRacaOcultaDoJogador(cenario, ficha, poder) && <p className="bloqueio-raca-oculta" role="note">{AVISO_RACA_OCULTA_MESTRE}</p>}
            {isMestre && (
                <div className="bloqueio-raca-mestre" role="group" aria-label={`Controles de Raça de ${nomePoder}`}>
                    <label className="bloqueio-raca-campo">Percentual mínimo da Raça (%)
                        <input type="number" min={0} max={100} step={1} className="input-neon composicao-input-percentual" value={minimoTxt}
                            aria-label={`Percentual mínimo da Raça (%) de ${nomePoder}`}
                            onChange={(ev) => setMinimoTxt(ev.target.value)} onBlur={gravarMinimo} />
                    </label>
                    <div className="bloqueio-raca-bloco">
                        <label className="bloqueio-raca-interruptor">
                            <input type="checkbox" checked={manual === true} aria-label={`Bloquear ${nomePoder}`} onChange={(ev) => mudarBloqueio(ev.target.checked)} />
                            <span>🔒 Bloquear (ainda não despertou / impedimento)</span>
                        </label>
                        <label className="bloqueio-raca-campo">Requisito para desbloquear
                            <input type="text" maxLength={300} className="input-neon" value={requisitoTxt} aria-label={`Requisito para desbloquear ${nomePoder}`}
                                onChange={(ev) => setRequisitoTxt(ev.target.value)} onBlur={gravarTextosBloqueio} />
                        </label>
                        <label className="bloqueio-raca-campo">Motivo
                            <input type="text" maxLength={300} className="input-neon" value={motivoTxt} aria-label={`Motivo do bloqueio de ${nomePoder}`}
                                onChange={(ev) => setMotivoTxt(ev.target.value)} onBlur={gravarTextosBloqueio} />
                        </label>
                        {manual && <button type="button" className="btn-neon btn-gold bloqueio-raca-despertar" onClick={() => setConfirmando(true)}>✨ Despertar (desbloquear)</button>}
                    </div>
                    {bloqueio.bloqueado && bloqueio.origem === 'percentual' && (
                        <div className="bloqueio-raca-pratica">
                            <button type="button" className="btn-neon" aria-expanded={praticaAberta} onClick={() => setPraticaAberta(v => !v)}>＋ Conceder prática</button>
                            {praticaAberta && <ComposicaoRacialEditor entidade={entidade} ficha={ficha} rotulo="🧬 Composição" inicialAberto />}
                        </div>
                    )}
                    {mensagem && <p className="composicao-mensagem" role="status">{mensagem}</p>}
                </div>
            )}

            {confirmando && (
                <DialogoTematico titulo="✨ Despertar Habilidade" aoFechar={() => setConfirmando(false)}
                    descricao={`Despertar "${nomePoder}" desbloqueia a Habilidade de Raça e avisa a mesa no Feed. Confirmar?`}
                    acoes={(
                        <>
                            <button type="button" className="btn-neon" data-foco-inicial onClick={() => setConfirmando(false)}>Cancelar</button>
                            <button type="button" className="btn-neon btn-gold" onClick={despertar}>✨ Despertar</button>
                        </>
                    )} />
            )}
        </div>
    );
}

export function DnaDoPoder({ poder, entidade, isMestre }) {
    const [mensagem, setMensagem] = useState('');
    const alternar = useCallback((v) => {
        const r = definirManipulaDNA(entidade, poder.id, v);
        setMensagem(r.ok ? '' : (r.mensagem || 'Não foi possível concluir.'));
    }, [entidade, poder.id]);
    const marcado = poder.manipulaDNA === true;
    if (isMestre) {
        return (
            <div className="composicao-dna-mestre">
                <label className="bloqueio-raca-interruptor" title="Com este poder marcado, o dono pode pedir Raças novas ao Mestre (Ficha → 🧬 Composição Racial).">
                    <input type="checkbox" checked={marcado} aria-label={`Manipulação de DNA em ${poder.nome || 'poder'}`} onChange={(ev) => alternar(ev.target.checked)} />
                    <span>🧬 Manipulação de DNA (permite pedir Raças)</span>
                </label>
                {mensagem && <p className="composicao-mensagem composicao-mensagem--erro" role="status">{mensagem}</p>}
            </div>
        );
    }
    return marcado ? <span className="grimorio-selo composicao-dna-selo" title="Este poder permite pedir Raças novas ao Mestre (Manipulação de DNA)">🧬 DNA</span> : null;
}
