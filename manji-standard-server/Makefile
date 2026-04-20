# manji-standard-server/Makefile
#
# このファイルはプロジェクトルート直下（manji-standard-server/ と同じ階層）に
# 配置されることを想定した管理用 Makefile です。
#
# 配置例:
#   <project-root>/
#   ├── manji-standard-server/       ← このリポジトリのスキル・subagent を配置
#   ├── .claude/            ← 実際に読み込まれる Claude Code の設定
#   ├── Makefile            ← manji-standard-server/Makefile をコピーまたは include
#   └── docs/
#       ├── spec/
#       ├── work/
#       └── knowledge/
#
# 使い方（プロジェクトルートで実行）:
#   make -f manji-standard-server/Makefile help
#
# もしくは、このファイルをプロジェクトルートにコピーして:
#   cp manji-standard-server/Makefile ./Makefile
#   make help

SHELL := /bin/bash

# === パス設定 ===
SOURCE_DIR     := manji-standard-server
SKILLS_SRC     := $(SOURCE_DIR)/skills
AGENTS_SRC     := $(SOURCE_DIR)/agents

CLAUDE_DIR     := .claude
SKILLS_DST     := $(CLAUDE_DIR)/skills
AGENTS_DST     := $(CLAUDE_DIR)/agents

DOCS_DIR       := docs
DOCS_SUBDIRS   := spec work knowledge

# === 色 ===
GREEN   := \033[0;32m
BLUE    := \033[0;34m
YELLOW  := \033[0;33m
RED     := \033[0;31m
NC      := \033[0m

.DEFAULT_GOAL := help
.PHONY: help list list-skills list-agents \
        install install-skills install-agents \
        link link-skills link-agents \
        sync uninstall clean \
        docs-init doctor

# === help ===
help: ## 利用可能なターゲット一覧を表示
	@echo ""
	@echo "  manji-standard-server management"
	@echo "  ======================="
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@printf "\n  よく使う順序:\n"
	@printf "    1. $(BLUE)make -f manji-standard-server/Makefile doctor$(NC)       # 環境確認\n"
	@printf "    2. $(BLUE)make -f manji-standard-server/Makefile docs-init$(NC)    # docs/ 初期化\n"
	@printf "    3. $(BLUE)make -f manji-standard-server/Makefile install$(NC)      # skills + agents 配置\n"
	@printf "    4. $(BLUE)make -f manji-standard-server/Makefile list$(NC)         # 配置済み確認\n\n"

# === 一覧表示 ===
list: list-skills list-agents ## 利用可能な skills と agents を一覧表示

list-skills: ## 利用可能な skill 一覧
	@printf "$(BLUE)Available skills ($(SKILLS_SRC)):$(NC)\n"
	@if [ -d $(SKILLS_SRC) ]; then \
		ls -1 $(SKILLS_SRC) | sed 's/^/  - /'; \
	else \
		printf "  $(RED)(not found: $(SKILLS_SRC))$(NC)\n"; \
	fi

list-agents: ## 利用可能な subagent 一覧
	@printf "$(BLUE)Available subagents ($(AGENTS_SRC)):$(NC)\n"
	@if [ -d $(AGENTS_SRC) ]; then \
		ls -1 $(AGENTS_SRC) | sed 's/\.md$$//' | sed 's/^/  - /'; \
	else \
		printf "  $(RED)(not found: $(AGENTS_SRC))$(NC)\n"; \
	fi

# === インストール（コピー） ===
install: install-skills install-agents ## skills と agents を .claude/ にコピー配置
	@printf "$(GREEN)✔$(NC) install complete\n"

install-skills: ## skills のみコピー配置
	@if [ ! -d $(SKILLS_SRC) ]; then \
		printf "$(RED)✗$(NC) $(SKILLS_SRC) が見つかりません\n"; exit 1; \
	fi
	@mkdir -p $(SKILLS_DST)
	@for d in $(SKILLS_SRC)/*/; do \
		name=$$(basename $$d); \
		src=$${d%/}; \
		printf "  copy skill: %s\n" "$$name"; \
		rm -rf $(SKILLS_DST)/$$name; \
		cp -R $$src $(SKILLS_DST)/$$name; \
	done
	@printf "$(GREEN)✔$(NC) skills installed to $(SKILLS_DST)/\n"

install-agents: ## agents のみコピー配置
	@if [ ! -d $(AGENTS_SRC) ]; then \
		printf "$(RED)✗$(NC) $(AGENTS_SRC) が見つかりません\n"; exit 1; \
	fi
	@mkdir -p $(AGENTS_DST)
	@for f in $(AGENTS_SRC)/*.md; do \
		name=$$(basename $$f); \
		printf "  copy agent: %s\n" "$$name"; \
		cp $$f $(AGENTS_DST)/; \
	done
	@printf "$(GREEN)✔$(NC) agents installed to $(AGENTS_DST)/\n"

# === リンク配置（シンボリックリンク） ===
link: link-skills link-agents ## skills と agents をシンボリックリンクで配置（更新が即時反映）
	@printf "$(GREEN)✔$(NC) link complete\n"

link-skills: ## skills をシンボリックリンクで配置
	@if [ ! -d $(SKILLS_SRC) ]; then \
		printf "$(RED)✗$(NC) $(SKILLS_SRC) が見つかりません\n"; exit 1; \
	fi
	@mkdir -p $(SKILLS_DST)
	@for d in $(SKILLS_SRC)/*/; do \
		name=$$(basename $$d); \
		target=$$(cd $$d && pwd); \
		link=$(SKILLS_DST)/$$name; \
		if [ -L $$link ] || [ -e $$link ]; then \
			rm -rf $$link; \
		fi; \
		ln -s $$target $$link; \
		printf "  link skill: %s\n" "$$name"; \
	done
	@printf "$(GREEN)✔$(NC) skills linked into $(SKILLS_DST)/\n"

link-agents: ## agents をシンボリックリンクで配置
	@if [ ! -d $(AGENTS_SRC) ]; then \
		printf "$(RED)✗$(NC) $(AGENTS_SRC) が見つかりません\n"; exit 1; \
	fi
	@mkdir -p $(AGENTS_DST)
	@for f in $(AGENTS_SRC)/*.md; do \
		name=$$(basename $$f); \
		target=$$(cd $$(dirname $$f) && pwd)/$$name; \
		link=$(AGENTS_DST)/$$name; \
		if [ -L $$link ] || [ -e $$link ]; then \
			rm -f $$link; \
		fi; \
		ln -s $$target $$link; \
		printf "  link agent: %s\n" "$$name"; \
	done
	@printf "$(GREEN)✔$(NC) agents linked into $(AGENTS_DST)/\n"

# === 更新・削除 ===
sync: ## 既存配置を最新の manji-standard-server/ 内容で上書き（install と同義）
	@printf "$(YELLOW)syncing...$(NC)\n"
	@$(MAKE) -f $(firstword $(MAKEFILE_LIST)) install

uninstall: ## manji-standard-server/ 由来の skills / agents を .claude/ から削除
	@printf "$(YELLOW)uninstalling manji-standard-server artifacts...$(NC)\n"
	@if [ -d $(SKILLS_SRC) ]; then \
		for d in $(SKILLS_SRC)/*/; do \
			name=$$(basename $$d); \
			target=$(SKILLS_DST)/$$name; \
			if [ -e $$target ] || [ -L $$target ]; then \
				rm -rf $$target; \
				printf "  removed skill: %s\n" "$$name"; \
			fi; \
		done; \
	fi
	@if [ -d $(AGENTS_SRC) ]; then \
		for f in $(AGENTS_SRC)/*.md; do \
			name=$$(basename $$f); \
			target=$(AGENTS_DST)/$$name; \
			if [ -e $$target ] || [ -L $$target ]; then \
				rm -f $$target; \
				printf "  removed agent: %s\n" "$$name"; \
			fi; \
		done; \
	fi
	@printf "$(GREEN)✔$(NC) uninstall complete\n"

clean: uninstall ## uninstall のエイリアス

# === docs/ 初期化 ===
docs-init: ## docs/{spec,work,knowledge}/ を作成（存在すればスキップ）
	@for sub in $(DOCS_SUBDIRS); do \
		dir=$(DOCS_DIR)/$$sub; \
		if [ ! -d $$dir ]; then \
			mkdir -p $$dir; \
			printf "  created: %s/\n" "$$dir"; \
		else \
			printf "  exists:  %s/\n" "$$dir"; \
		fi; \
	done
	@printf "$(GREEN)✔$(NC) docs layout ready\n"

# === 環境診断 ===
doctor: ## 配置状況 / パス / CLAUDE.md の有無をチェック
	@printf "\n  doctor\n  ======\n\n  Source:\n"
	@if [ -d $(SOURCE_DIR) ]; then \
		printf "    $(GREEN)✔$(NC) %s/ (skills: %s, agents: %s)\n" \
			"$(SOURCE_DIR)" \
			"$$(ls -1 $(SKILLS_SRC) 2>/dev/null | wc -l | tr -d ' ')" \
			"$$(ls -1 $(AGENTS_SRC) 2>/dev/null | wc -l | tr -d ' ')"; \
	else \
		printf "    $(RED)✗$(NC) %s/ not found\n" "$(SOURCE_DIR)"; \
	fi
	@printf "\n  Destination:\n"
	@if [ -d $(CLAUDE_DIR) ]; then \
		printf "    $(GREEN)✔$(NC) %s/ (skills: %s, agents: %s)\n" \
			"$(CLAUDE_DIR)" \
			"$$(ls -1 $(SKILLS_DST) 2>/dev/null | wc -l | tr -d ' ')" \
			"$$(ls -1 $(AGENTS_DST) 2>/dev/null | wc -l | tr -d ' ')"; \
	else \
		printf "    $(YELLOW)⚠$(NC) %s/ not found (run: make install)\n" "$(CLAUDE_DIR)"; \
	fi
	@printf "\n  Project context:\n"
	@if [ -f CLAUDE.md ]; then \
		printf "    $(GREEN)✔$(NC) CLAUDE.md (size: %s bytes)\n" "$$(wc -c < CLAUDE.md | tr -d ' ')"; \
	elif [ -f AGENTS.md ]; then \
		printf "    $(GREEN)✔$(NC) AGENTS.md (size: %s bytes)\n" "$$(wc -c < AGENTS.md | tr -d ' ')"; \
	else \
		printf "    $(YELLOW)⚠$(NC) CLAUDE.md / AGENTS.md not found\n"; \
		printf "      → manji-standard-server/README.md の「言語・アーキテクチャの指定方法」を参照\n"; \
	fi
	@printf "\n  Docs layout:\n"
	@for sub in $(DOCS_SUBDIRS); do \
		dir=$(DOCS_DIR)/$$sub; \
		if [ -d $$dir ]; then \
			count=$$(find $$dir -type f 2>/dev/null | wc -l | tr -d ' '); \
			printf "    $(GREEN)✔$(NC) %s/ (%s files)\n" "$$dir" "$$count"; \
		else \
			printf "    $(YELLOW)⚠$(NC) %s/ not found (run: make docs-init)\n" "$$dir"; \
		fi; \
	done
	@printf "\n"
