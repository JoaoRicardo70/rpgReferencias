import React, { useCallback, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { useFichaAtiva } from '../Ficha Def/FichaAlvoContext';
import { pedirRacaAdquirida } from '../../services/composicaoRacial';
import { getRacas, getComposicaoRacial, resolverRaca, temComposicaoExplicita } from '../../core/racas';
import DialogoTematico from './DialogoTematico';

// 🧬 COMPOSIÇÃO RACIAL na Ficha (somente leitura para todos): Raça principal + Domínio (= o percentual) de cada Raça da composição, com o selo
// Nativa/Adquirida. SE o dono da ficha tem algum poder marcado pelo Mestre como Manipulação de DNA (manipulaDNA), aparece "🧬 Pedir nova Raça"
// (só na PRÓPRIA ficha) e a lista dos pedidos pendentes; sem poder de DNA o botão não existe. O Mestre aprova em 👑 Mestre → 🧬 Raças.
const comoLista = (v) => (Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []));

export default function ComposicaoRacialFicha() {
    const cenario = useStore(s => s.cenario);
    const { ficha, souEuMesmo } = useFichaAtiva();
    const [modal, setModal] = useState(false);
    const [racaId, setRacaId] = useState('');
    const [motivo, setMotivo] = useState('');
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const composicao = useMemo(() => getComposicaoRacial(cenario, ficha), [cenario, ficha]);
    const principal = useMemo(() => resolverRaca(cenario, ficha), [cenario, ficha]);
    const temDNA = useMemo(() => comoLista(ficha && ficha.poderes).some(p => p && p.manipulaDNA === true), [ficha]);
    const pedidos = useMemo(() => comoLista(ficha && ficha.bio && ficha.bio.pedidosRaca).filter(p => p && p.racaId), [ficha]);
    const livres = useMemo(() => racas.filter(r => !composicao.some(e => e.racaId === r.id) && !pedidos.some(p => p.racaId === r.id)), [racas, composicao, pedidos]);

    const fechar = useCallback(() => { setModal(false); setErro(''); }, []);
    const enviar = useCallback(() => {
        if (!racaId) { setErro('Escolha a Raça que deseja.'); return; }
        const r = pedirRacaAdquirida(racaId, motivo);
        if (!r.ok) { setErro(r.mensagem || 'Não foi possível enviar o pedido.'); return; }
        setModal(false); setErro(''); setRacaId(''); setMotivo('');
        setAviso('Pedido enviado ao Mestre. Ele decide e define o percentual inicial.');
    }, [racaId, motivo]);

    const podePedir = souEuMesmo && temDNA && racas.length > 0;
    if (racas.length === 0 || (composicao.length === 0 && !podePedir)) return null;
    const nomeRaca = (id) => { const r = racas.find(x => x.id === id); return r ? `${r.icone} ${r.nome}` : id; };

    return (
        <section className="composicao-ficha" aria-label="Composição Racial">
            <h4 className="composicao-ficha-titulo">🧬 Composição Racial</h4>
            {principal.cadastrada && <p className="composicao-principal">Raça principal: <strong>{nomeRaca(principal.id)}</strong> · Domínio {(composicao.find(e => e.racaId === principal.id) || { percentual: 0 }).percentual}%</p>}
            {souEuMesmo && principal.cadastrada && temComposicaoExplicita(ficha) && !composicao.some(e => e.racaId === principal.id) && (
                <p className="composicao-dica" role="note">Sua composição racial é definida pelo Mestre.</p>
            )}
            {composicao.length > 0 && (
                <ul className="composicao-chips">
                    {composicao.map(e => (
                        <li key={e.racaId} className={`composicao-chip composicao-chip--${e.origem}`}>
                            <span className="composicao-chip-nome">{e.icone} {e.nome}</span>
                            <span className="composicao-chip-dominio">Domínio {e.percentual}%</span>
                            <span className="composicao-chip-selo">{e.origem === 'adquirida' ? '🧪 Adquirida' : '🌱 Nativa'}</span>
                            <span className="composicao-barra" aria-hidden="true"><span className="composicao-barra-cheia" style={{ width: `${e.percentual}%` }} /></span>
                        </li>
                    ))}
                </ul>
            )}
            {podePedir && (
                <div className="pedido-raca-ficha">
                    <button type="button" className="btn-neon btn-gold" onClick={() => { setAviso(''); setModal(true); }}>🧬 Pedir nova Raça</button>
                    {pedidos.length > 0 && (
                        <ul className="pedido-raca-pendentes" aria-label="Seus pedidos de Raça pendentes">
                            {pedidos.map(p => <li key={p.id}>⏳ {nomeRaca(p.racaId)}{p.motivo ? ` — ${p.motivo}` : ''} (aguardando o Mestre)</li>)}
                        </ul>
                    )}
                    {aviso && <p className="composicao-mensagem" role="status">{aviso}</p>}
                </div>
            )}
            {modal && (
                <DialogoTematico titulo="🧬 Pedir nova Raça" aoFechar={fechar}
                    descricao="Sua Manipulação de DNA permite pedir uma Raça nova. O Mestre decide e define o percentual inicial (normalmente 10%)."
                    acoes={(
                        <>
                            <button type="button" className="btn-neon" onClick={fechar}>Cancelar</button>
                            <button type="button" className="btn-neon btn-gold" onClick={enviar}>Enviar pedido</button>
                        </>
                    )}>
                    <label className="pedido-raca-campo">Raça desejada
                        <select className="input-neon" value={racaId} onChange={(ev) => setRacaId(ev.target.value)} aria-label="Raça desejada">
                            <option value="">Escolha uma Raça…</option>
                            {livres.map(r => <option key={r.id} value={r.id}>{r.icone} {r.nome}</option>)}
                        </select>
                    </label>
                    {livres.length === 0 && <p className="equipes-vazio">Você já tem ou já pediu todas as Raças do catálogo.</p>}
                    <label className="pedido-raca-campo">Motivo (como você obteve o DNA?)
                        <textarea className="input-neon" rows={3} maxLength={300} value={motivo} onChange={(ev) => setMotivo(ev.target.value)} aria-label="Motivo do pedido" />
                    </label>
                    {erro && <p className="composicao-mensagem composicao-mensagem--erro" role="alert">{erro}</p>}
                </DialogoTematico>
            )}
        </section>
    );
}
