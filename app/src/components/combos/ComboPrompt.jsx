import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { temCombos, opcoesDeCombo, estadoDeCombo, zerarEstadoDeCombo, rotuloAcaoGolpe, resumirCombo, descreverBuff, ACOES_GOLPE } from '../../core/combos';
import { removerBuffsDoCombate } from '../../core/suporte';
import { aplicarEscolhaCombo, acaoFaltando, definirEstadoDeCombo, aceitarOfertaFollowUp } from './aplicarCombo';
import { ofertasValidas, localizarFollowUp, removerOfertaFollowUp, limparSemEncadeio } from '../../core/ofertaFollowUp';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { useAtorDosAvisos } from '../combate/AvisosDoAtor';

// 🥋 Aviso de Combo (mesmo jeito do aviso de Reação, components/combate/ReacaoPrompt.jsx): quando um golpe SEU acerta, pergunta o que foi:
// o iniciador de um Combo, o próximo golpe do Combo em andamento ou um Follow Up. Só aparece para quem criou Combos; "Foi um golpe comum" ignora.
// Também zera o estado do Combo quando o combate acaba (a iniciativa volta a 0).
// Só olha Acertos NOVOS (com `ts` de depois de este componente montar), como o aviso de Reação.
const FOLGA_RELOGIO_MS = 5 * 1000;

const acertou = (f) => {
    const alvos = Array.isArray(f.alvosArea) ? f.alvosArea : [];
    return alvos.length === 0 || alvos.some(a => a && a.acertou); // sem alvo marcado: o jogador confirma
};

export default function ComboPrompt() {
    const feed = useStore(s => s.feedCombate);
    const meuNome = useStore(s => s.meuNome);
    // 🎭 Ficha ativa: a do NPC em que o Mestre está atuando (AvisosDoAtor) ou a minha.
    const { ficha: minhaFicha, updateFicha, nome: nomeFichaAtiva } = useFichaAtiva();
    const salvarAtivo = useCallSaveAtivo();
    const { nomeFeed, ehAtor } = useAtorDosAvisos();
    const adicionarAviso = useStore(s => s.adicionarAviso);
    // O Mestre nunca é consultado: a oferta de FUA só abre para um jogador, na ficha dele.
    const souMestreReal = useStore(s => s.isMestre);
    const souMestre = souMestreReal && !ehAtor;
    const vistos = useRef(new Set());
    const montadoEm = useRef(Date.now());
    const [pedido, setPedido] = useState(null);
    const [escolhido, setEscolhido] = useState('');
    const [custo, setCusto] = useState('padrao');
    const [gastar, setGastar] = useState(true);
    const [custoOferta, setCustoOferta] = useState('');
    const [gastarOferta, setGastarOferta] = useState(true);

    const opcoes = useMemo(() => (pedido ? opcoesDeCombo(minhaFicha) : null), [pedido, minhaFicha]);

    // Lista plana do que dá para escolher (a ordem é a da tela).
    const itens = useMemo(() => {
        if (!opcoes) return [];
        const lista = [];
        if (opcoes.proximo) lista.push({ id: 'avancar', escolha: { tipo: 'avancar', combo: opcoes.proximo.combo, golpe: opcoes.proximo.golpe }, titulo: `Golpe ${opcoes.proximo.indice + 1} do Combo "${opcoes.proximo.combo.nome}": ${opcoes.proximo.golpe.nome || 'golpe'}`, detalhe: opcoes.proximo.ultimo ? 'Último golpe: conclui o Combo e os buffs ficam no máximo.' : 'Avança o Combo e soma os buffs deste golpe.', buffs: opcoes.proximo.golpe.buffs, acao: opcoes.proximo.golpe.acao, permitidas: [opcoes.proximo.golpe.acao] });
        opcoes.iniciadores.forEach(({ combo, golpe }) => lista.push({ id: `iniciar-${combo.id}`, escolha: { tipo: 'iniciar', combo, golpe }, titulo: `Iniciar o Combo "${combo.nome}" com ${golpe.nome}`, detalhe: resumirCombo(combo), buffs: golpe.buffs, acao: golpe.acao, permitidas: [golpe.acao] }));
        opcoes.followUps.forEach(({ followUp, nivel }) => lista.push({ id: `fu-${followUp.id}`, escolha: { tipo: 'followUp', followUp, golpe: followUp }, titulo: `Follow Up "${followUp.nome}" (nível ${nivel + 1})`, detalhe: followUp.niveis[nivel].descricao || followUp.descricao || 'Pode ser usado fora do turno.', buffs: followUp.niveis[nivel].buffs, acao: followUp.acoesPermitidas[0], permitidas: followUp.acoesPermitidas }));
        return lista;
    }, [opcoes]);

    // Procura Acertos novos meus e monta o pedido (só se a ficha usa Combos e há o que escolher).
    useEffect(() => {
        if (!meuNome || !nomeFeed || !minhaFicha || !Array.isArray(feed) || pedido) return;
        const usaCombos = temCombos(minhaFicha);
        for (const f of feed) {
            if (!f || f.tipo !== 'acerto' || !f.ts || f.nome !== nomeFeed) continue;
            const chave = `${f.ts}|${f.nome}`;
            if (vistos.current.has(chave)) continue;
            vistos.current.add(chave); // vale também sem Combos: um golpe de antes de criar o primeiro Combo não vira aviso depois
            if (!usaCombos || f.ts < montadoEm.current - FOLGA_RELOGIO_MS) continue;
            if (!acertou(f)) {
                if (estadoDeCombo(minhaFicha).ativo) adicionarAviso('O golpe errou. Se o Combo foi quebrado, interrompa na Ficha > Combate > Combos.', 'alerta');
                continue;
            }
            const o = opcoesDeCombo(minhaFicha);
            if (!o.proximo && o.iniciadores.length === 0 && o.followUps.length === 0) continue;
            setEscolhido('');
            setPedido({ ts: f.ts });
            break;
        }
    }, [feed, meuNome, nomeFeed, minhaFicha, pedido, adicionarAviso]);

    // Fim do combate (o Mestre zerou a iniciativa): Combos e Follow Ups começam do zero no próximo.
    const iniciativaAnterior = useRef({ nome: nomeFichaAtiva, valor: minhaFicha?.iniciativa });
    useEffect(() => {
        // Só conta a virada da MESMA ficha (trocar de personagem não zera os Combos do outro).
        const antes = iniciativaAnterior.current.nome === nomeFichaAtiva ? Number(iniciativaAnterior.current.valor) || 0 : 0;
        const agora = Number(minhaFicha?.iniciativa) || 0;
        iniciativaAnterior.current = { nome: nomeFichaAtiva, valor: minhaFicha?.iniciativa };
        if (minhaFicha && antes > 0 && agora === 0) {
            const temCombos = JSON.stringify(estadoDeCombo(minhaFicha)) !== JSON.stringify(zerarEstadoDeCombo());
            // ✨ Buffs de Suporte "até o fim do combate" (core/suporte.js) saem junto.
            const temBuffsDoCombate = (minhaFicha.buffsTemporarios || []).some(b => b && b.ateFimCombate);
            if (temCombos || temBuffsDoCombate) {
                updateFicha((f) => {
                    if (temCombos) definirEstadoDeCombo(f, zerarEstadoDeCombo());
                    if (temBuffsDoCombate) f.buffsTemporarios = removerBuffsDoCombate(f.buffsTemporarios);
                });
                salvarAtivo();
                adicionarAviso(temCombos ? 'Combate encerrado: Combos zerados.' : 'Combate encerrado: buffs do combate removidos.', 'info');
            }
        }
    }, [minhaFicha, nomeFichaAtiva, updateFicha, salvarAtivo, adicionarAviso]);

    // 🥋 Oferta de Follow Up (FUA) guardada pelos gatilhos: a primeira ainda válida. Só aparece quando não há o pedido de Combo na tela.
    const oferta = useMemo(() => (souMestre ? null : (ofertasValidas(minhaFicha)[0] || null)), [minhaFicha, souMestre]);
    const followUpDaOferta = useMemo(() => (oferta ? localizarFollowUp(minhaFicha, oferta.followUpId) : null), [oferta, minhaFicha]);
    // Outra oferta na tela: Ação e "gastar" voltam ao padrão (nada herdado da oferta anterior).
    const idDaOferta = oferta ? oferta.id : '';
    useEffect(() => { setCustoOferta(''); setGastarOferta(true); }, [idDaOferta]);
    const acaoDaOferta = custoOferta || (followUpDaOferta ? followUpDaOferta.acoesPermitidas[0] : 'padrao');

    const aceitarOferta = useCallback(() => {
        if (!oferta || !followUpDaOferta) return;
        const falta = gastarOferta ? acaoFaltando(minhaFicha, acaoDaOferta) : [];
        if (falta.length > 0 && !window.confirm(`Sem ${falta.join(' e ')} disponível. Usar mesmo assim?`)) return;
        let texto = '';
        updateFicha((f) => { texto = aceitarOfertaFollowUp(f, oferta.id, { custo: acaoDaOferta, gastar: gastarOferta }); });
        salvarAtivo();
        if (texto) enviarParaFeed({ tipo: 'sistema', nome: nomeFeed, texto });
        if (texto) adicionarAviso('Follow Up aceito: faça o golpe na aba de Ataque.', 'info');
        else adicionarAviso('Esta oferta de Follow Up já não vale.', 'alerta');
        setCustoOferta('');
    }, [oferta, followUpDaOferta, gastarOferta, acaoDaOferta, minhaFicha, updateFicha, salvarAtivo, nomeFeed, adicionarAviso]);

    const recusarOferta = useCallback(() => {
        if (!oferta) return;
        updateFicha((f) => { removerOfertaFollowUp(f, oferta.id); limparSemEncadeio(f); });
        salvarAtivo();
        setCustoOferta('');
    }, [oferta, updateFicha, salvarAtivo]);

    const item = itens.find(i => i.id === escolhido) || null;
    const escolher = useCallback((i) => { setEscolhido(i.id); setCusto(i.acao); setGastar(true); }, []);
    const recusar = useCallback(() => { setPedido(null); setEscolhido(''); }, []);

    const confirmar = useCallback(() => {
        if (!item) return;
        const escolha = { ...item.escolha, custo };
        const falta = gastar ? acaoFaltando(minhaFicha, custo) : [];
        if (falta.length > 0 && !window.confirm(`Sem ${falta.join(' e ')} disponível. Usar mesmo assim?`)) return;
        let texto = '';
        updateFicha((f) => { texto = aplicarEscolhaCombo(f, escolha, { gastar }); });
        salvarAtivo();
        if (texto) enviarParaFeed({ tipo: 'sistema', nome: nomeFeed, texto });
        adicionarAviso(gastar ? `Combo registrado (gastou 1 ${rotuloAcaoGolpe(custo)}).` : 'Combo registrado.', 'info');
        setPedido(null);
        setEscolhido('');
    }, [item, custo, gastar, minhaFicha, updateFicha, salvarAtivo, nomeFeed, adicionarAviso]);

    if (typeof document === 'undefined' || !document.body) return null;

    if (!pedido) {
        if (!oferta) return null;
        const nivelOferta = followUpDaOferta ? followUpDaOferta.niveis[0] : null;
        const efeitoCusto = oferta.custoReducaoPct ? (oferta.custoReducaoPct >= 100 ? ': o golpe não gasta energia.' : `: o golpe custa ${oferta.custoReducaoPct}% menos energia.`) : '.';
        return createPortal(
            <div className="reacao-fundo" role="dialog" aria-label="Oferta de Follow Up">
                <div className="reacao-caixa">
                    <h3 className="reacao-titulo">🥋 {oferta.gatilho} ofereceu um Follow Up</h3>
                    <p className="reacao-contexto">{followUpDaOferta ? `Follow Up "${followUpDaOferta.nome || 'sem nome'}"${efeitoCusto}` : 'Este Follow Up não existe mais na ficha.'}{oferta.naoGeraOutro ? ' Este golpe não gera outro Follow Up.' : ''}</p>
                    {followUpDaOferta && (
                        <>
                            <p className="reacao-opcao-efeito">{(nivelOferta && nivelOferta.descricao) || followUpDaOferta.descricao || 'Escolha o golpe e role normalmente na aba de Ataque depois de aceitar.'}</p>
                            <div className="combo-custo">
                                {followUpDaOferta.acoesPermitidas.length > 1 ? (
                                    <label>Pagar com <select className="input-neon" value={acaoDaOferta} onChange={(e) => setCustoOferta(e.target.value)}>
                                        {followUpDaOferta.acoesPermitidas.map(a => <option key={a} value={a}>{rotuloAcaoGolpe(a)}</option>)}
                                    </select></label>
                                ) : null}
                                <label><input type="checkbox" checked={gastarOferta} onChange={(e) => setGastarOferta(e.target.checked)} /> Gastar 1 {rotuloAcaoGolpe(acaoDaOferta)} agora (desmarque se já gastou)</label>
                            </div>
                        </>
                    )}
                    <div className="reacao-botoes">
                        <button type="button" className="reacao-reagir" onClick={aceitarOferta} disabled={!followUpDaOferta}>🥋 ACEITAR</button>
                        <button type="button" className="reacao-recusar" onClick={recusarOferta}>Recusar</button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="reacao-fundo" role="dialog" aria-label="Combo e Follow Up">
            <div className="reacao-caixa">
                <h3 className="reacao-titulo">🥋 Seu golpe acertou!</h3>
                <p className="reacao-contexto">O que foi esse golpe?</p>
                <div className="reacao-opcoes">
                    {itens.map(i => (
                        <label key={i.id} className={`reacao-opcao${escolhido === i.id ? ' marcada' : ''}`}>
                            <input type="radio" name="escolha-combo" checked={escolhido === i.id} onChange={() => escolher(i)} />
                            <span className="reacao-opcao-nome">{i.titulo}</span>
                            <span className="reacao-opcao-efeito">{i.detalhe}{i.buffs.length > 0 ? ` Buffs: ${i.buffs.map(descreverBuff).join('; ')}.` : ''}</span>
                        </label>
                    ))}
                </div>
                {item && (
                    <div className="combo-custo">
                        {item.permitidas.length > 1 ? (
                            <label>Pagar com <select className="input-neon" value={custo} onChange={(e) => setCusto(e.target.value)}>
                                {item.permitidas.map(a => <option key={a} value={a}>{ACOES_GOLPE.find(x => x.id === a).rotulo}</option>)}
                            </select></label>
                        ) : null}
                        <label><input type="checkbox" checked={gastar} onChange={(e) => setGastar(e.target.checked)} /> Gastar 1 {rotuloAcaoGolpe(custo)} agora (desmarque se já gastou)</label>
                    </div>
                )}
                <div className="reacao-botoes">
                    <button type="button" className="reacao-reagir" onClick={confirmar} disabled={!item}>🥋 CONFIRMAR</button>
                    <button type="button" className="reacao-recusar" onClick={recusar}>Foi um golpe comum</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
