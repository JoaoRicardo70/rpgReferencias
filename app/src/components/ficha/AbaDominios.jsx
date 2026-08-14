import React, { useState } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';

// 📜 REFERÊNCIA DE NÍVEIS
const NIVEIS_INFO = {
    1: { nome: "Básico", cor: "#44ff44", desc: "+10% Dano" },
    2: { nome: "Intermediário", cor: "#44ff44", desc: "+25% Dano | -5% Custo" },
    3: { nome: "Avançado", cor: "#44ff44", desc: "+50% Dano | -10% Custo" },
    4: { nome: "Virtuoso", cor: "#0088ff", desc: "Dano x2 | Ignora Resistências Menores" },
    5: { nome: "Maestria", cor: "#0088ff", desc: "Dano x3.5 | -25% Custo | -50% Dano Sofrido" },
    6: { nome: "Perfeito", cor: "#0088ff", desc: "Dano x6 | Imunidade Total | Incancelável" },
    7: { nome: "Molecular", cor: "#aa00ff", desc: "Dano x10 | Ignora Imunidades | Dano Persistente" },
    8: { nome: "Atômico", cor: "#aa00ff", desc: "Dano x50 | -50% Custo | Desintegração de Armadura" },
    9: { nome: "Absoluto", cor: "#ff003c", desc: "Dano x100 | Custo ZERO | Silenciamento de Elemento" },
    10: { nome: "Eterno", cor: "#ffcc00", desc: "Dano Incalculável | Apagamento Conceitual" }
};

const PREDEFINICOES = {
    elementos: {
        "Elementos Básicos": ["Fogo", "Raio", "Agua", "Vento", "Terra"],
        "Básicos Verdadeiros": ["Fogo Verdadeiro", "Raio Verdadeiro", "Agua Verdadeira", "Vento Verdadeiro", "Terra Verdadeira"],
        "Elementos Avançados": ["Solar", "Energia", "Gelo", "Vacuo", "Natureza"],
        "Avançados Verdadeiros": ["Solar Verdadeiro", "Energia Verdadeira", "Gelo Verdadeiro", "Vacuo Verdadeiro", "Natureza Verdadeira"]
    },
    mana: {
        "Magias de Ciclo": ["Truques de Ciclo", "Magias de 1º a 10º Ciclo"],
        "Magias Arcanas/Negras": ["Truques Arcanos/Negros", "Magias Arcanas/Negra de 1º a 10º Ciclo"],
        "Magias Ancestrais": ["Truques Ancestrais", "Magia de Sangue", "Magia de Osso", "Magia Draconica", "Magia de Alma", "Magia de Tempo", "Magia de Gravidade", "Magia Espacial", "Magia de Borracha", "Magia de Espelho", "Magia de Sal", "Magia de Tremor", "Magia de Equipamento", "Magia de Explosao", "Magia de Metamorfose"]
    },
    chakra: {
        "Kekkei Genkai": ["Elemento Madeira", "Elemento Mineral", "Elemento Cinzas", "Elemento Igneo", "Elemento Lava", "Elemento Vapor", "Elemento Nevoa", "Elemento Tempestade", "Elemento Areia", "Elemento Tufao"],
        "Kekkei Touta": ["Elemento Velocidade", "Elemento Poeira", "Elemento Veneno", "Elemento Cal", "Elemento Carbono", "Elemento Calor", "Elemento Som", "Elemento Magnetismo"]
    },
    aura: {
        "Manifestação": ["Aura Pura", "Projeção de Aura", "Reforço de Aura"],
        "Fusões": ["Fusões Básicas", "Fusões Avançadas"]
    },
    primordiais: {
        "Primordiais Base": ["Luz", "Trevas", "Ether"],
        "Primordiais Verdadeiros": ["Celestial", "Infernal", "Caos"],
        "Absolutos": ["Criacao", "Destruicao", "Cosmos"]
    },
    astral: {
        "Domínios da Existência": ["Vida", "Morte", "Vazio", "Neutro", "Energia Astral"]
    },
    marciais: {
        "Fundamentos": ["Artes Marciais (Combate Corpo-a-Corpo)", "Reforço Físico"],
        "Estilos de Combate": ["Punho do Dragão", "Palma Suave", "Caminho do Tigre", "Boxe Demoníaco", "Artes de Assassino", "Estilo Bêbado", "Punho de Ferro"]
    },
    armas: {
        "Kenjutsu (Espadas)": ["Ittouryu (1 Espada)", "Nitouryu (2 Espadas)", "Santouryu (3 Espadas)", "Iaido", "Kenjutsu"],
        "Posturas de Combate": ["Postura da Montanha", "Postura da Água", "Postura do Vento", "Postura do Trovão"],
        "Outras Armas": ["Maestria com Lança", "Maestria com Foice", "Maestria com Arco", "Maestria com Armas de Fogo", "Maestria com Escudo"]
    },
    cura: {
        "Medicina": ["Regeneração Básica", "Cura Celular", "Purificação", "Reversão Temporal", "Transferência Vital", "Ressurreição Limitada"]
    },
    summons: {
        "Pactos": ["Pacto Demoníaco", "Feras Divinas", "Espíritos Ancestrais", "Contrato Dracônico", "Exército de Sombras", "Invocação de Armamento Sagrado"]
    }
};

const flatPredefs = {};
Object.keys(PREDEFINICOES).forEach(key => { flatPredefs[key] = Object.values(PREDEFINICOES[key]).flat(); });

export default function AbaDominios() {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const [selecionados, setSelecionados] = useState({});
    const [salvando, setSalvando] = useState(false);

    if (!minhaFicha) return <div style={{ color: '#888', padding: 20 }}>Carregando ficha...</div>;
    const dominios = minhaFicha.dominios || {};

    const atualizarDominio = (categoria, item, nivel) => {
        updateFicha(f => {
            if (!f.dominios) f.dominios = {};
            const targetCat = ['elementos', 'mana', 'chakra', 'aura', 'astral', 'primordiais'].includes(categoria) ? 'elementais' : categoria;
            if (!f.dominios[targetCat]) f.dominios[targetCat] = {};
            if (nivel === 0) delete f.dominios[targetCat][item];
            else f.dominios[targetCat][item] = { nivel: nivel, nome: NIVEIS_INFO[nivel].nome };
        });
    };

    const handleSalvarTudo = async () => {
        setSalvando(true);
        try {
            await salvarFichaSilencioso(); // 🔥 Força a sincronização com o Firebase!
            setTimeout(() => setSalvando(false), 2000);
        } catch (e) {
            alert("Erro ao salvar no Firebase! Verifique as regras de segurança.");
            setSalvando(false);
        }
    };

    const renderSecao = (titulo, chave, corBase) => {
        const isMagica = ['elementos', 'mana', 'chakra', 'aura', 'astral', 'primordiais'].includes(chave);
        const gavetaDoStore = isMagica ? 'elementais' : chave;
        const todasMagias = flatPredefs.elementos.concat(flatPredefs.mana, flatPredefs.chakra, flatPredefs.aura, flatPredefs.astral, flatPredefs.primordiais);

        return (
            <div className="def-box" style={{ borderLeft: `4px solid ${corBase}`, marginBottom: '20px' }}>
                <h3 style={{ color: corBase, margin: '0 0 10px 0', fontSize: '1em' }}>{titulo}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select className="input-neon" value={selecionados[chave] || ""} onChange={(e) => setSelecionados(prev => ({ ...prev, [chave]: e.target.value }))}
                            style={{ flex: '1', width: '100%', padding: '8px', borderColor: corBase, background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
                            <option value="">-- Escolher da Lore --</option>
                            {Object.entries(PREDEFINICOES[chave] || {}).map(([grupo, itens]) => (
                                <optgroup key={grupo} label={`— ${grupo} —`} style={{ color: corBase, fontStyle: 'italic', background: '#111' }}>
                                    {itens.map(p => <option key={p} value={p} style={{ color: '#fff', fontStyle: 'normal' }}>{p}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <button className="btn-neon" onClick={() => { if(selecionados[chave]) { atualizarDominio(chave, selecionados[chave], 1); setSelecionados(prev => ({ ...prev, [chave]: "" })); } }} 
                            style={{ flex: '0 0 auto', width: 'auto', borderColor: corBase, color: corBase, margin: 0, padding: '8px 15px', fontWeight: 'bold' }}>ADICIONAR</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input id={`custom-${chave}`} className="input-neon" placeholder="Criar novo (Ex: Punho das Sombras)" 
                            style={{ flex: '1', width: '100%', padding: '8px', borderColor: '#ffcc00', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '0.85em' }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { const val = e.target.value; if(val && val.trim() !== '') { atualizarDominio(chave, val.trim(), 1); e.target.value = ''; } } }} />
                        <button className="btn-neon" onClick={() => { const input = document.getElementById(`custom-${chave}`); if(input.value && input.value.trim() !== '') { atualizarDominio(chave, input.value.trim(), 1); input.value = ''; } }} 
                            style={{ flex: '0 0 auto', width: 'auto', borderColor: '#ffcc00', color: '#ffcc00', margin: 0, padding: '8px 15px', fontWeight: 'bold' }}>➕ CRIAR</button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(dominios[gavetaDoStore] || {}).filter(([nome]) => {
                        const isNestaLista = flatPredefs[chave].includes(nome);
                        const isCustom = isMagica ? !todasMagias.includes(nome) : !flatPredefs[chave].includes(nome);
                        return isNestaLista || (isCustom && (chave === 'elementos' || !isMagica));
                    }).map(([nome, dados]) => (
                        <div key={nome} style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '5px', border: '1px solid #333' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong style={{ color: '#fff', fontSize: '0.9em' }}>{nome.toUpperCase()}</strong>
                                <select className="input-neon" value={dados.nivel} onChange={(e) => atualizarDominio(chave, nome, Number(e.target.value))} style={{ borderColor: NIVEIS_INFO[dados.nivel].cor, color: NIVEIS_INFO[dados.nivel].cor, width: '120px', fontSize: '0.8em' }}>
                                    {[...Array(11).keys()].map(n => <option key={n} value={n}>{n === 0 ? "❌ Apagar" : `Lv ${n} - ${NIVEIS_INFO[n].nome}`}</option>)}
                                </select>
                            </div>
                            <div style={{ marginTop: '5px', fontSize: '0.75em', color: '#aaa', fontStyle: 'italic' }}>
                                <span style={{ color: NIVEIS_INFO[dados.nivel].cor }}>⚡:</span> {NIVEIS_INFO[dados.nivel].desc}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: '10px' }}>
            <h2 style={{ color: '#ffcc00', borderBottom: '2px solid #ffcc00', paddingBottom: '10px', marginBottom: '20px' }}>💎 HIERARQUIA DE DOMÍNIOS</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '15px' }}>
                {renderSecao("🔥 Manipulação Elemental", "elementos", "#ff6600")}
                {renderSecao("🔮 Artes de Mana (Grimório)", "mana", "#0088ff")}
                {renderSecao("🌀 Artes de Chakra (Shinobi)", "chakra", "#00ffcc")}
                {renderSecao("✨ Artes de Aura (Manifestação)", "aura", "#b366ff")}
                {renderSecao("🌌 Artes Primordiais (Cósmicas)", "primordiais", "#ff00ff")}
                {renderSecao("💫 Artes Astrais (Vida/Morte)", "astral", "#ffcc00")}
                {renderSecao("🥋 Artes Marciais (Taijutsu)", "marciais", "#ff003c")}
                {renderSecao("⚔️ Maestria de Armas (Kenjutsu)", "armas", "#ff8800")}
                {renderSecao("💚 Atributos de Cura", "cura", "#44ff44")}
                {renderSecao("👹 Summons & Contratos", "summons", "#aa00ff")}
            </div>

            {/* 🔥 BOTÃO DE SALVAMENTO MANUAL INTEGRADO 🔥 */}
            <button className={`btn-neon ${salvando ? 'btn-green' : 'btn-gold'}`} onClick={handleSalvarTudo} 
                style={{ width: '100%', marginTop: '20px', height: '50px', fontWeight: 'bold', fontSize: '1.1em' }}>
                {salvando ? '✅ HIERARQUIA SINCRONIZADA!' : '💾 SALVAR HIERARQUIA NO SERVIDOR'}
            </button>
        </div>
    );
}