import React, { useMemo } from 'react';
import { getRacas, getComposicaoRacial, resolverRaca, temComposicaoExplicita } from '../../core/racas';
import { composicaoVisivel, racasDesconhecidasDoDono, ROTULO_RACA_OCULTA } from '../../core/racasVisibilidade';
import ComposicaoRacialEditor from '../mestre/ComposicaoRacialEditor';
import SeletorVisibilidadeRaca from './SeletorVisibilidadeRaca';
import useVisaoRacas from './useVisaoRacas';

// 🧬 Composição Racial e Domínio na Ficha Definitiva (Marcados.jsx), logo abaixo da lista da bio.
//  - Jogador (dono): vê SÓ as Raças que pode ver (nome, barra e número de Domínio %, origem Nativa/Adquirida) e alterna cada uma entre Pública e Privada.
//    Raça 'secreta' aparece como "❓ Raça desconhecida" (sem percentual). Não edita percentuais: quem define é o Mestre.
//  - Mestre/Co-Mestre (também na ficha de OUTRO personagem, pelo Grimório da Entidade): o ComposicaoRacialEditor (percentual, ＋ Prática, histórico,
//    adicionar/remover Raça e visibilidade Pública/Privada/Secreta + 👁️ Revelar), aberto. Modo Jogador = visão de jogador.
// Só exibição: ver o limite honesto em core/racasVisibilidade.js.
export default function DominioRacialFicha() {
    const { cenario, ficha, viewer, isMestre, souEuMesmo, entidade, principal: principalVisivel } = useVisaoRacas();
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const composicao = useMemo(() => composicaoVisivel(cenario, ficha, viewer), [cenario, ficha, viewer]);
    const desconhecidas = useMemo(() => racasDesconhecidasDoDono(cenario, ficha, viewer), [cenario, ficha, viewer]);
    const principal = useMemo(() => resolverRaca(cenario, ficha), [cenario, ficha]);
    if (!ficha || racas.length === 0) return null;
    // Raça principal sem entrada na composição (texto livre fora do catálogo, ou catalogada fora da composição explícita): ganha a sua própria linha,
    // com a visibilidade na chave do racaId (ou '_principal' no texto livre).
    const textoLivre = !principal.cadastrada && !!principal.nome;
    const principalForaDaComposicao = principal.cadastrada && !getComposicaoRacial(cenario, ficha).some(e => e.racaId === principal.id);
    const linhaPrincipal = textoLivre || principalForaDaComposicao;
    const chavePrincipal = principal.cadastrada ? principal.id : '_principal';
    if (!isMestre && composicao.length === 0 && desconhecidas.length === 0 && !(linhaPrincipal && principalVisivel.texto)) return null;

    return (
        <section className="composicao-ficha dominio-racial-ficha" aria-label="Composição Racial e Domínio">
            <h4 className="composicao-ficha-titulo">🧬 Composição Racial e Domínio</h4>
            {linhaPrincipal && (principalVisivel.texto || isMestre) && (
                <p className="composicao-principal composicao-principal--livre">
                    Raça principal: <strong>{principalVisivel.texto}</strong>{' '}
                    {(souEuMesmo || isMestre) && !(principalVisivel.oculta && !isMestre) && <SeletorVisibilidadeRaca entidade={entidade} chave={chavePrincipal} ficha={ficha} souMestre={isMestre} nomeRaca="Raça principal" />}
                </p>
            )}
            {isMestre ? (
                <ComposicaoRacialEditor entidade={entidade} ficha={ficha} rotulo="✏️ Editar composição e visibilidade" inicialAberto />
            ) : (
                <>
                    <ul className="composicao-chips">
                        {composicao.map(e => (
                            <li key={e.racaId} className={`composicao-chip composicao-chip--${e.origem}`}>
                                <span className="composicao-chip-nome">{e.icone} {e.nome}</span>
                                <span className="composicao-chip-dominio">Domínio {e.percentual}%</span>
                                <span className="composicao-chip-selo">{e.origem === 'adquirida' ? '🧪 Adquirida' : '🌱 Nativa'}</span>
                                <span className="composicao-barra" aria-hidden="true"><span className="composicao-barra-cheia" style={{ width: `${e.percentual}%` }} /></span>
                                {souEuMesmo && <SeletorVisibilidadeRaca entidade={entidade} chave={e.racaId} ficha={ficha} nomeRaca={e.nome} />}
                            </li>
                        ))}
                        {desconhecidas.map(e => (
                            <li key={`oculta-${e.racaId}`} className="composicao-chip composicao-chip--oculta">
                                <span className="composicao-chip-nome">{ROTULO_RACA_OCULTA}</span>
                            </li>
                        ))}
                    </ul>
                    {souEuMesmo && principal.cadastrada && temComposicaoExplicita(ficha) && (
                        <p className="composicao-dica" role="note">O Domínio e a composição são definidos pelo Mestre. Você escolhe se cada Raça é pública ou só sua e do Mestre.</p>
                    )}
                </>
            )}
        </section>
    );
}
