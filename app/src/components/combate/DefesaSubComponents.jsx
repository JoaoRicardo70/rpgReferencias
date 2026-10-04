import React from 'react';
import { useDefesaForm, ATACANTE_AUTO, ATACANTE_NENHUM } from './DefesaFormContext';
import DisputaPoderResumo from './DisputaPoderResumo';

const FALLBACK = <div style={{ color: '#888', padding: 10 }}>Defesa provider não encontrado</div>;

export function DefesaSofrerDanoBox() {
    const ctx = useDefesaForm();
    if (!ctx) return FALLBACK;

    const { elementoInc, setElementoInc, danoRecebidoInc, setDanoRecebidoInc, sofrerDanoBruto, elementosDinamicos, atacanteInc, setAtacanteInc, opcoesAtacante, ultimoGolpeRecebido, disputaDefesa, danoDeDado, setDanoDeDado } = ctx;

    return (
        <div className="def-box fade-in" style={{ marginBottom: 15, borderLeft: '4px solid #ff4444', background: 'rgba(255, 68, 68, 0.05)' }}>
            <h3 style={{ color: '#ff4444', marginBottom: 10, marginTop: 0 }}>🩸 Sofrer Dano (Redução de HP)</h3>
            <p style={{ color: '#aaa', fontSize: '0.85em', marginTop: 0 }}>Se falhou na esquiva/bloqueio, digite o dano que o inimigo mandou e selecione o elemento do ataque. O sistema calculará as suas vulnerabilidades automaticamente!</p>

            {/* ⚖️ Disputa de Poder: o Poder de quem golpeou contra o seu ajusta o dano recebido */}
            <div className="disputa-atacante">
                <label htmlFor="defesa-atacante">Quem atacou?</label>
                <select id="defesa-atacante" className="input-neon" value={atacanteInc} onChange={e => setAtacanteInc(e.target.value)}>
                    <option value={ATACANTE_AUTO}>{ultimoGolpeRecebido ? `Último ataque: ${ultimoGolpeRecebido.nome}` : 'Último ataque (nenhum no feed)'}</option>
                    {opcoesAtacante.map(o => <option key={o.valor} value={o.valor}>{o.isDummie ? '🤖 ' : '🧑 '}{o.nome}</option>)}
                    <option value={ATACANTE_NENHUM}>Sem Disputa de Poder (x1)</option>
                </select>
            </div>
            {disputaDefesa.disputa && (
                <DisputaPoderResumo disputa={disputaDefesa.disputa} nomeAtacante={disputaDefesa.nomeAtacante} nomeDefensor="Você" />
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '15px' }}>
                {elementosDinamicos.map(el => (
                    <button 
                        key={el.id}
                        onClick={() => setElementoInc(el.id)}
                        className={`btn-neon ${elementoInc === el.id ? 'btn-red' : ''}`}
                        style={{ 
                            flex: '1 1 60px', padding: '4px', fontSize: '0.7em', margin: 0,
                            borderColor: elementoInc === el.id ? (el.cor || '#444') : '#444',
                            color: elementoInc === el.id ? '#fff' : '#888',
                            background: elementoInc === el.id ? `${el.cor || '#ff4444'}30` : 'transparent'
                        }}
                    >
                        {el.nome}
                    </button>
                ))}
            </div>

            {/* 🎲 Dano de dado é proporcional à Vida de quem recebe (core/danoProporcional.js) */}
            <label className="dano-de-dado-check" title="Marcado: o número do dado pesa na sua Vida máxima (1 ponto = 0,5% da Vida, valor ajustável pelo Mestre). Desmarque se o dano é um valor fixo.">
                <input type="checkbox" checked={danoDeDado} onChange={e => setDanoDeDado(e.target.checked)} /> 🎲 É o número de uma rolagem de dado (proporcional à minha Vida)
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
                <input
                    className="input-neon"
                    type="number"
                    placeholder="Valor do Dano Bruto (Ex: 25000)"  
                    value={danoRecebidoInc} 
                    onChange={e => setDanoRecebidoInc(e.target.value)} 
                    style={{ flex: '1 1 200px', margin: 0, fontSize: '1.2em' }} 
                />
                <button 
                    className="btn-neon btn-red" 
                    onClick={sofrerDanoBruto} 
                    style={{ flex: '0 1 150px', margin: 0, padding: '10px', fontWeight: 'bold' }}
                >
                    SUBTRAIR HP
                </button>
            </div>
        </div>
    );
}

export function DefesaEvasaoBox() {
    const ctx = useDefesaForm();
    if (!ctx) return FALLBACK;

    const {
        evaDados, setEvaDados,
        evaFaces, setEvaFaces,
        evaProf, setEvaProf,
        evaBonus, setEvaBonus,
        caEvasiva,
        declararEvasiva,
    } = ctx;

    return (
        <div className="def-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#0088ff', marginBottom: 5, marginTop: 0 }}>Esquiva Acrobática</h3>
                <h2 style={{ color: '#0088ff', margin: 0, textShadow: '0 0 10px #0088ff' }}>CA: {caEvasiva}</h2>
            </div>
            <p style={{ color: '#888', fontSize: '0.85em', marginTop: 0 }}>Pode rolar dados caso use uma Reação para se esquivar ativamente.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Dados (+)</label>
                    <input className="input-neon" type="number" min="0" value={evaDados} onChange={e => setEvaDados(e.target.value)} title="Se 0, apenas a CA base é enviada" />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Faces (d)</label>
                    <input className="input-neon" type="number" min="1" value={evaFaces} onChange={e => setEvaFaces(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Proficiência</label>
                    <input className="input-neon" type="number" value={evaProf} onChange={e => setEvaProf(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Bónus Fixo</label>
                    <input className="input-neon" type="number" value={evaBonus} onChange={e => setEvaBonus(e.target.value)} />
                </div>
            </div>
            <button className="btn-neon btn-blue" onClick={declararEvasiva} style={{ marginTop: 10, width: '100%' }}>
                DECLARAR ESQUIVA
            </button>
        </div>
    );
}

export function DefesaResistenciaBox() {
    const ctx = useDefesaForm();
    if (!ctx) return FALLBACK;

    const {
        resDados, setResDados,
        resFaces, setResFaces,
        resProf, setResProf,
        resBonus, setResBonus,
        caResistencia,
        declararResistencia,
    } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: '#ccc', marginBottom: 5, marginTop: 0 }}>Bloqueio Bruto</h3>
                <h2 style={{ color: '#ccc', margin: 0, textShadow: '0 0 10px #ccc' }}>CA: {caResistencia}</h2>
            </div>
            <p style={{ color: '#888', fontSize: '0.85em', marginTop: 0 }}>Pode rolar dados caso use uma Reação para tentar parar o golpe.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Dados (+)</label>
                    <input className="input-neon" type="number" min="0" value={resDados} onChange={e => setResDados(e.target.value)} title="Se 0, apenas a CA base é enviada" />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Faces (d)</label>
                    <input className="input-neon" type="number" min="1" value={resFaces} onChange={e => setResFaces(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Proficiência</label>
                    <input className="input-neon" type="number" value={resProf} onChange={e => setResProf(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Bónus Fixo</label>
                    <input className="input-neon" type="number" value={resBonus} onChange={e => setResBonus(e.target.value)} />
                </div>
            </div>
            <button className="btn-neon" onClick={declararResistencia} style={{ marginTop: 10, width: '100%' }}>
                DECLARAR BLOQUEIO
            </button>
        </div>
    );
}

export function DefesaEscudoBox() {
    const ctx = useDefesaForm();
    if (!ctx) return FALLBACK;

    const {
        redEnergia, setRedEnergia,
        redPerc, setRedPerc,
        redMult, setRedMult,
        declararReducao,
    } = ctx;

    return (
        <div className="def-box" style={{ marginTop: 15 }}>
            <h3 style={{ color: '#f0f', marginBottom: 10, marginTop: 0 }}>Escudo de Energia (Redução)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Energia</label>
                    <select className="input-neon" value={redEnergia} onChange={e => setRedEnergia(e.target.value)}>
                        <option value="mana">Mana</option>
                        <option value="aura">Aura</option>
                        <option value="chakra">Chakra</option>
                        <option value="corpo">Corpo</option>
                        <option value="poder">PODER TOTAL</option>
                    </select>
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>% Dreno</label>
                    <input className="input-neon" type="number" value={redPerc} onChange={e => setRedPerc(e.target.value)} />
                </div>
                <div>
                    <label style={{ color: '#aaa', fontSize: '0.85em' }}>Multiplicador</label>
                    <input className="input-neon" type="number" step="0.01" value={redMult} onChange={e => setRedMult(e.target.value)} />
                </div>
            </div>
            <button className="btn-neon" onClick={declararReducao} style={{ marginTop: 10, width: '100%', borderColor: '#f0f', color: '#f0f' }}>
                ATIVAR ESCUDO
            </button>
        </div>
    );
}