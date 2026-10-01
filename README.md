<div align="center">
<img src="assets/alchemy.svg" alt="Ícone do Sistema de Alquimia" width="96" />

# Sistema de Alquimia

**Conhecimento, experimentação e produção para Foundry VTT**

Um módulo de alquimia para campanhas de **D&D 5e**, com receitas descobríveis, ingredientes, poções, venenos, progressão e ferramentas completas para jogadores e Mestres.

<p>
<img src="https://img.shields.io/badge/Foundry%20VTT-v13-7c3aed?style=for-the-badge&logo=foundry-virtual-tabletop&logoColor=white" alt="Foundry VTT v13" />
    <img src="https://img.shields.io/badge/D%26D%205e-4.0.0%2B-b91c1c?style=for-the-badge" alt="D&D 5e 4.0.0 ou superior" />
    <img src="https://img.shields.io/badge/idioma-pt--BR-15803d?style=for-the-badge" alt="Português do Brasil" />
    <img src="https://img.shields.io/badge/licença-MIT-d97706?style=for-the-badge" alt="Licença MIT" />
  </p>
</div>

> *“Toda grande descoberta começa com um ingrediente, uma hipótese e a coragem de misturá-los.”*

---

## Visão geral

O **Sistema de Alquimia** adiciona uma camada completa de criação e descoberta ao seu mundo de Foundry VTT. Personagens podem reunir ingredientes, aprender fórmulas, experimentar combinações e fabricar resultados — enquanto o Mestre controla o catálogo, o conhecimento individual e as regras da oficina.

A interface acompanha a atmosfera do módulo com três temas visuais:

- **Pergaminho** — para uma bancada clássica de estudos;

- **Escuro** — para laboratórios, masmorras e oficinas noturnas;

- **Claro** — para uma leitura mais limpa e luminosa.

## Recursos

### Para personagens

- Descoberta e conhecimento individual de receitas;

- Biblioteca de poções, venenos e itens especiais;

- Experimentação livre com **2 ou 3 ingredientes**;

- Testes de alquimia usando perícias, atributos ou fórmulas;

- Consumo automático de ingredientes;

- Restauração compensatória quando uma tentativa não deve consumir reagentes;

- Histórico de fabricação por personagem;

- Favoritos e anotações privadas;

- Progressão alquímica com XP, níveis e especializações;

- Uso de poções, aplicação de venenos e efeitos integrados ao D&D 5e;

- Integração opcional com **Midi-QOL**.

### Para Mestres

- Painel administrativo de alquimia;

- Criação, edição, duplicação e exclusão de receitas;

- Importação e exportação do catálogo;

- Distribuição ou remoção de conhecimento dos personagens;

- Controle de histórico, anotações e progressão;

- Restauração das receitas de exemplo;

- Logs administrativos;

- Configuração de receitas secretas, descobríveis e requisitos de equipamento.

## Conteúdo incluído

| Elemento | Quantidade / detalhe |
| --- | --- |
| Ingredientes alquímicos | **36** na biblioteca interna |
| Receitas padrão | **7** exemplos prontos |
| Catálogo expandido | **41** receitas |
| Tipos de resultado | Poção, veneno e especial |
| Idioma da interface | Português do Brasil |
| Temas | Pergaminho, escuro e claro |
| Sistema compatível | D&D 5e 4.0.0 ou superior |
| Foundry VTT | v13 |

Entre os ingredientes disponíveis estão ervas, raízes, cogumelos, cristais, pós minerais, essências elementais, partes de criaturas, líquidos e reagentes estabilizadores.

## Compatibilidade

| Componente | Compatibilidade |
| --- | --- |
| Foundry Virtual Tabletop | v13 |
| Sistema D&D 5e | 4.0.0 ou superior, compatível com Foundry v13 |
| Midi-QOL | Opcional — usado para automação de itens e efeitos |

> O módulo funciona sem o Midi-QOL. Quando instalado, a integração fica disponível para os recursos compatíveis.

## Instalação

### Instalação manual

1. Baixe este repositório ou clone-o dentro da pasta de módulos do Foundry:

   ```
   FoundryData/Data/modules/alchemy-system
   ```

1. Confirme que o arquivo `module.json` está diretamente dentro da pasta `alchemy-system`.

1. Reinicie o Foundry VTT.

1. Abra um mundo baseado em **D&D 5e**.

1. Acesse **Configurações → Gerenciar Módulos**.

1. Ative o **Sistema de Alquimia**.

> O identificador da pasta deve ser exatamente `alchemy-system`.

## Preparando os ingredientes

O módulo inclui o macro [`macros/create-alchemy-ingredients.js`](macros/create-alchemy-ingredients.js), que cria ou atualiza os 36 ingredientes alquímicos no mundo ou em um compêndio de itens.

### Criar os ingredientes em um compêndio

1. Abra [`macros/create-alchemy-ingredients.js`](macros/create-alchemy-ingredients.js).

1. Copie todo o conteúdo do arquivo.

1. No Foundry, abra **Macros** e crie um macro do tipo **Script**.

1. Cole o conteúdo e configure as constantes no início do macro:

   ```
   const DESTINO = "compendium";
   const COMPENDIUM_COLLECTION = "";
   const QUANTIDADE_INICIAL = 3;
   const ATUALIZAR_EXISTENTES = true;
   ```

1. Execute o macro como Mestre.

1. Se `COMPENDIUM_COLLECTION` estiver vazio, selecione o compêndio na janela exibida.

Para apontar diretamente para um compêndio específico:

```
const COMPENDIUM_COLLECTION = "world.alchemy-ingredients";
```

Substitua `world.alchemy-ingredients` pelo identificador do seu compêndio. Ele precisa ser um compêndio de **Itens** e estar desbloqueado para escrita.

O macro:

- cria ou atualiza os 36 ingredientes;

- evita duplicatas pelo nome;

- aplica a flag `alchemy-system.ingredient`;

- define a quantidade inicial;

- registra as propriedades alquímicas;

- informa no final quantos itens foram criados e atualizados.

## Como usar

### Jogadores

A interface pode ser aberta de qualquer uma destas formas:

- pelo botão de frasco na barra de chat;

- pelo botão de alquimia na ficha do personagem;

- selecionando um token vinculado a um personagem;

- pela API pública do módulo.

Para fabricar uma receita, o personagem deve possuir:

- os ingredientes necessários na quantidade exigida;

- conhecimento da receita, quando o conhecimento individual estiver ativo;

- o equipamento requerido, como **Kit de Alquimia**, quando essa opção estiver habilitada.

### Mestres

O painel administrativo pode ser aberto pelo controle de token ou pela API:

```
game.modules.get("alchemy-system").api.openGM();
```

No painel, o Mestre pode administrar receitas, ingredientes, conhecimento dos personagens, histórico, progressão, importação e exportação.

## Experimentação

A experimentação permite selecionar exatamente **2 ou 3 ingredientes** e testar uma combinação.

Dependendo das configurações do mundo, uma combinação pode:

- revelar uma receita válida;

- descobrir automaticamente uma fórmula;

- produzir uma poção ou veneno;

- gerar uma mistura defeituosa;

- resultar em falha simples;

- executar um teste de alquimia com CD configurável.

As combinações são revalidadas no momento da execução para evitar resultados inconsistentes com o inventário atual.

## Fabricação e itens do D&D 5e

As receitas mapeadas usam os itens reais do compêndio `dnd5e.items` como origem. Ao fabricar um item, o módulo preserva:

- descrição original;

- imagem;

- tipo e dados do item;

- efeitos e configurações do D&D 5e;

- identificação da origem em `flags.core.sourceId`.

A fabricação cria uma cópia mundial do documento do compêndio, seguindo o comportamento normal do Foundry VTT.

A receita de exemplo **Poção de Cura Superior** utiliza o seguinte UUID:

```
Compendium.dnd5e.items.Item.5m9ErO9In8Uc5yyf
```

Se uma receita configurada por UUID ou aliases não encontrar o item correspondente, a fabricação é interrompida com uma mensagem clara — sem criar um item genérico silenciosamente.

## Configurações disponíveis

As configurações do módulo permitem controlar:

- conhecimento individual por personagem;

- experimentação e descoberta automática;

- consumo de ingredientes em sucessos e falhas;

- testes, falhas, sucessos parciais e falhas críticas;

- exigência de equipamentos;

- identificação de ingredientes por nome;

- visibilidade das receitas desconhecidas;

- modo de falha para combinações inválidas;

- visibilidade dos cartões no chat;

- leitura de anotações pelo Mestre;

- limite do histórico por personagem;

- tema da interface;

- modo de depuração.

## API pública

Abrir a interface do jogador:

```
game.modules.get("alchemy-system").api.open();
```

Abrir a interface do jogador para um ator específico:

```
game.modules.get("alchemy-system").api.open(actor);
```

Abrir o painel do Mestre:

```
game.modules.get("alchemy-system").api.openGM();
```

A API também fica disponível globalmente como `AlchemyModule`.

## Atualização de receitas

O módulo mantém um `schemaVersion` para migrar receitas salvas no mundo.

Após atualizar o módulo:

1. entre no mundo como Mestre;

1. aguarde o módulo concluir a inicialização;

1. abra o painel administrativo;

1. confirme se as receitas e seus mapeamentos foram atualizados.

Os novos aliases e UUIDs de compêndio são aplicados às receitas existentes durante a migração.

## Desenvolvimento

O projeto não possui processo de build nem dependências externas obrigatórias. Para validar a instalação local, execute na raiz do repositório:

```bash
node tools/validate.mjs
node tools/regression.mjs
```

### Validação

O script `tools/validate.mjs` verifica:

- JSON do manifesto e das traduções;

- campos esperados no `module.json`;

- caminhos declarados no manifesto;

- sintaxe dos arquivos JavaScript;

- existência dos imports relativos;

- integridade das receitas de exemplo;

- correspondência dos ingredientes no inventário.

### Regressão

O script `tools/regression.mjs` verifica:

- as 7 receitas padrão;

- as 41 receitas expandidas;

- receitas específicas, como invisibilidade e pele de pedra;

- propriedades da antitoxina concentrada;

- validação de todas as receitas;

- uso de 2 ou 3 ingredientes por receita.

## Estrutura do projeto

```
alchemy-system/
├── assets/                 # Ícones SVG do módulo
├── lang/                   # Traduções, atualmente pt-BR
├── macros/                 # Macros para criação e manutenção de ingredientes
├── scripts/                # API, dados, fabricação, inventário e integração
├── styles/                 # Temas e estilos da interface
├── templates/              # Templates Handlebars das interfaces
├── tools/                  # Validação e testes de regressão
├── LICENSE                 # Licença MIT
├── module.json             # Manifesto do módulo
└── README.md               # Este documento
```

## Contribuindo

Contribuições são bem-vindas.

Antes de abrir um pull request:

1. descreva claramente o problema ou a melhoria;

1. mantenha a interface e as traduções consistentes;

1. execute os scripts de validação e regressão;

1. informe no pull request quais testes foram executados;

1. evite alterar receitas existentes sem documentar a mudança.

Para relatar um problema, abra uma [issue](https://github.com/Larycronx/alchemy-system/issues) com:

- versão do Foundry VTT;

- versão do D&D 5e;

- versão do módulo;

- módulos adicionais ativos;

- passos para reproduzir o problema;

- mensagens relevantes do console, se houver.

## Licença

Este projeto é distribuído sob a [licença MIT](LICENSE).

## Links

- [Repositório do projeto](https://github.com/Larycronx/alchemy-system)

- [Foundry Virtual Tabletop](https://foundryvtt.com/)

- [Sistema D&D 5e](https://foundryvtt.com/packages/dnd5e/)

- [Issues e sugestões](https://github.com/Larycronx/alchemy-system/issues)

---

<div align="center">
<sub>Forjado para campanhas de fantasia, descobertas perigosas e poções que talvez não devessem ser bebidas.</sub>
</div>
