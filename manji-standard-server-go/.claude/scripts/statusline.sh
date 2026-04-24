#!/bin/bash

# Constants
readonly CACHE_FILE="/tmp/claude_statusline_cost_cache"
readonly CACHE_TTL=60  # seconds

# ANSI color codes
readonly COLOR_RESET='\033[0m'
readonly COLOR_GREEN='\033[0;32m'
readonly COLOR_YELLOW='\033[0;33m'
readonly COLOR_ORANGE='\033[0;91m'
readonly COLOR_RED='\033[0;31m'

# Calculate daily cost using ccusage
calculate_daily_cost() {
  if ! command -v ccusage >/dev/null 2>&1; then
    echo "0"
    return
  fi

  local today
  today=$(date +%Y%m%d)
  
  local ccusage_output
  ccusage_output=$(ccusage daily --json --since "$today" --until "$today" 2>/dev/null)
  
  if [ -z "$ccusage_output" ]; then
    echo "0"
    return
  fi
  
  local cost
  cost=$(echo "$ccusage_output" | jq -r ".daily | to_entries | .[0].value.totalCost // 0" 2>/dev/null)
  
  if [ -n "$cost" ] && [ "$cost" != "0" ]; then
    echo "$cost"
  else
    echo "0"
  fi
}

# Get cached cost or recalculate
get_cached_cost() {
  local today
  today=$(date +%Y-%m-%d)
  
  # Check if cache exists and is recent
  if [ -f "$CACHE_FILE" ]; then
    local cache_date cache_cost cache_age
    cache_date=$(head -1 "$CACHE_FILE" 2>/dev/null)
    cache_cost=$(tail -1 "$CACHE_FILE" 2>/dev/null)
    cache_age=$(($(date +%s) - $(stat -f %m "$CACHE_FILE" 2>/dev/null || echo 0)))
    
    # Use cache if it's from today and fresh
    if [ "$cache_date" = "$today" ] && [ "$cache_age" -le "$CACHE_TTL" ]; then
      echo "${cache_cost:-0.00}"
      return
    fi
  fi
  
  # Calculate and cache new cost
  local cost
  cost=$(calculate_daily_cost)
  cost="${cost:-0.00}"
  
  # Update cache
  echo "$today" >"$CACHE_FILE"
  echo "$cost" >>"$CACHE_FILE"
  
  echo "$cost"
}

# Get maximum context size based on model name
get_max_context_size() {
  local model_name="$1"

  # Handle empty or unknown model
  if [ -z "$model_name" ] || [ "$model_name" = "unknown" ]; then
    echo "100000"
    return
  fi

  # Normalize to lowercase
  local model_lower
  model_lower=$(echo "$model_name" | tr '[:upper:]' '[:lower:]')

  # Check for 1M context models (e.g., "Sonnet 4.5 (1M context)")
  if echo "$model_lower" | grep -qE '1m'; then
    echo "1000000"
    return
  fi

  # Determine context size based on model
  if echo "$model_lower" | grep -qE '(opus|sonnet|haiku).*4'; then
    echo "200000"
  elif echo "$model_lower" | grep -qE '(opus|sonnet|haiku).*3'; then
    echo "200000"
  else
    echo "100000"
  fi
}

# Format number with K/M suffix
format_number() {
  local num=$1

  if [ "$num" -ge 1000000 ]; then
    # 1M以上
    local m=$(echo "scale=1; $num / 1000000" | bc)
    # 小数点が.0なら整数表示
    if echo "$m" | grep -q '\.0$'; then
      echo "${m%.*}M"
    else
      echo "${m}M"
    fi
  elif [ "$num" -ge 1000 ]; then
    # 1K以上
    local k=$(echo "scale=1; $num / 1000" | bc)
    if echo "$k" | grep -q '\.0$'; then
      echo "${k%.*}K"
    else
      echo "${k}K"
    fi
  else
    # 1000未満
    echo "$num"
  fi
}

# Calculate token usage percentage
calculate_usage_percentage() {
  local total_tokens="$1"
  local max_context="$2"

  if [ "$max_context" -eq 0 ]; then
    echo "0.0"
    return
  fi

  local usage_percent
  usage_percent=$(echo "scale=1; $total_tokens * 100 / $max_context" | bc -l 2>/dev/null || echo "0")

  # Cap at 100%
  if (($(echo "$usage_percent > 100" | bc -l 2>/dev/null))); then
    echo "100.0"
  else
    echo "$usage_percent"
  fi
}

# Get color based on usage percentage
get_usage_color() {
  local usage_percent="$1"

  # Extract integer part for comparison
  local usage_int
  usage_int=$(echo "$usage_percent" | cut -d. -f1)
  usage_int=${usage_int:-0}

  if [ "$usage_int" -ge 100 ]; then
    echo "$COLOR_RED"
  elif [ "$usage_int" -ge 80 ]; then
    echo "$COLOR_ORANGE"
  elif [ "$usage_int" -ge 60 ]; then
    echo "$COLOR_YELLOW"
  else
    echo "$COLOR_GREEN"
  fi
}

# Get git branch information
get_git_info() {
  local current_dir="$1"

  # Change to the directory to check git status
  if [ -d "$current_dir" ]; then
    cd "$current_dir" 2>/dev/null || return
  fi

  # Check if we're in a git repository
  if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo ""
    return
  fi

  # Get current branch name
  local branch
  branch=$(git branch --show-current 2>/dev/null)

  # Handle detached HEAD state
  if [ -z "$branch" ]; then
    local commit_short
    commit_short=$(git rev-parse --short HEAD 2>/dev/null)
    if [ -n "$commit_short" ]; then
      branch="detached@$commit_short"
    else
      branch="unknown"
    fi
  fi

  echo "$branch"
}

# Get token usage and cache info from transcript
get_token_usage() {
  local session_id="$1"
  local transcript_dir="$2"
  local transcript_file="$transcript_dir/$session_id.jsonl"

  if [ ! -f "$transcript_file" ]; then
    echo "0:0:0:0"
    return
  fi

  # Get last usage entry (cumulative)
  local last_usage
  last_usage=$(grep '"usage"' "$transcript_file" 2>/dev/null | tail -1 | jq '.message.usage' 2>/dev/null)

  if [ -z "$last_usage" ] || [ "$last_usage" = "null" ]; then
    echo "0:0:0:0"
    return
  fi

  # Extract all token types
  local input output cache_creation cache_read
  input=$(echo "$last_usage" | jq -r '.input_tokens // 0')
  output=$(echo "$last_usage" | jq -r '.output_tokens // 0')
  cache_creation=$(echo "$last_usage" | jq -r '.cache_creation_input_tokens // 0')
  cache_read=$(echo "$last_usage" | jq -r '.cache_read_input_tokens // 0')

  # Return as colon-separated values: total:cache_creation:cache_read:output
  local total=$((input + output + cache_creation + cache_read))
  echo "$total:$cache_creation:$cache_read:$output"
}

# Generate progress bar with Unicode fractional blocks
generate_progress_bar() {
  local utilization="$1"
  local bar_width=10

  # Fractional block characters (1/8 to 8/8)
  local -a blocks=(" " "▏" "▎" "▍" "▌" "▋" "▊" "▉" "█")

  local percent
  percent=$(echo "$utilization" | awk '{printf "%d", $1}')

  # Calculate total eighths (bar_width * 8 = 80 levels)
  local total_eighths=$(( percent * bar_width * 8 / 100 ))
  local max_eighths=$(( bar_width * 8 ))
  if [ "$total_eighths" -gt "$max_eighths" ]; then
    total_eighths=$max_eighths
  fi

  local full_blocks=$(( total_eighths / 8 ))
  local remainder=$(( total_eighths % 8 ))

  local bar=""
  local i

  # Full blocks
  for ((i = 0; i < full_blocks; i++)); do
    bar="${bar}█"
  done

  # Fractional block
  if [ "$full_blocks" -lt "$bar_width" ] && [ "$remainder" -gt 0 ]; then
    bar="${bar}${blocks[$remainder]}"
    full_blocks=$((full_blocks + 1))
  fi

  # Empty blocks
  for ((i = full_blocks; i < bar_width; i++)); do
    bar="${bar}░"
  done

  echo "$bar"
}

# Get color based on utilization percentage
get_utilization_color() {
  local utilization="$1"

  # Convert to integer
  local percent
  percent=$(echo "$utilization" | awk '{printf "%d", $1}')

  if [ "$percent" -gt 80 ]; then
    echo "$COLOR_RED"
  elif [ "$percent" -ge 50 ]; then
    echo "$COLOR_YELLOW"
  else
    echo "$COLOR_GREEN"
  fi
}

# Format timestamp to local time
# Supports Unix epoch (primary, from Claude Code v2.1.80+) and UTC ISO 8601 without offset (fallback)
format_reset_time() {
  local timestamp="$1"
  local format="$2"  # "short" for HH:MM, "long" for M/D(曜日) HH:MM

  if [ -z "$timestamp" ]; then
    echo "N/A"
    return
  fi

  # Determine if timestamp is Unix epoch (numeric) or ISO 8601 (string)
  local epoch
  if [[ "$timestamp" =~ ^[0-9]+$ ]]; then
    # Unix epoch timestamp
    epoch="$timestamp"
  else
    # ISO 8601 timestamp - parse to epoch
    epoch=$(date -j -u -f "%Y-%m-%dT%H:%M:%S" "${timestamp:0:19}" "+%s" 2>/dev/null)
  fi

  if [ -z "$epoch" ]; then
    echo "N/A"
    return
  fi

  if [ "$format" = "short" ]; then
    # Format: HH:MM
    date -r "$epoch" "+%H:%M"
  else
    # Format: M/D(曜日) HH:MM
    local dow_num dow_ja
    dow_num=$(date -r "$epoch" "+%w")
    local -a dow_names=("日" "月" "火" "水" "木" "金" "土")
    dow_ja="${dow_names[$dow_num]}"
    date -r "$epoch" "+%-m/%-d(${dow_ja}) %H:%M"
  fi
}

# Display Claude Code usage line
display_usage_line() {
  local json_input="$1"

  # Check if input is provided
  if [ -z "$json_input" ]; then
    return
  fi

  # Extract all fields from rate_limits in a single jq call
  local five_hour_util five_hour_reset seven_day_util seven_day_reset
  IFS=$'\t' read -r five_hour_util five_hour_reset seven_day_util seven_day_reset < <(
    echo "$json_input" | jq -r '[
      .rate_limits.five_hour.used_percentage // "",
      .rate_limits.five_hour.resets_at // "",
      .rate_limits.seven_day.used_percentage // "",
      .rate_limits.seven_day.resets_at // ""
    ] | @tsv' 2>/dev/null
  )

  # Check if we have valid data
  if [ -z "$five_hour_util" ] || [ -z "$seven_day_util" ]; then
    return
  fi

  # Generate progress bars
  local five_hour_bar seven_day_bar
  five_hour_bar=$(generate_progress_bar "$five_hour_util")
  seven_day_bar=$(generate_progress_bar "$seven_day_util")

  # Get colors
  local five_hour_color seven_day_color
  five_hour_color=$(get_utilization_color "$five_hour_util")
  seven_day_color=$(get_utilization_color "$seven_day_util")

  # Format reset times
  local five_hour_time seven_day_time
  five_hour_time=$(format_reset_time "$five_hour_reset" "short")
  seven_day_time=$(format_reset_time "$seven_day_reset" "long")

  # Format utilization percentages (remove decimal if .0)
  local five_hour_percent seven_day_percent
  five_hour_percent=$(echo "$five_hour_util" | awk '{printf "%.0f", $1}')
  seven_day_percent=$(echo "$seven_day_util" | awk '{printf "%.0f", $1}')

  # Display usage line
  printf "⏱5h:${five_hour_color}%s %s%%${COLOR_RESET} (rst %s) | 📅7d:${seven_day_color}%s %s%%${COLOR_RESET} (rst %s)\n" \
    "$five_hour_bar" \
    "$five_hour_percent" \
    "$five_hour_time" \
    "$seven_day_bar" \
    "$seven_day_percent" \
    "$seven_day_time"
}

# Main
main() {
  # Read JSON from stdin
  local json_input
  json_input=$(cat)

  # Extract fields
  local model session_id current_dir
  model=$(echo "$json_input" | jq -r '.model.display_name // .model // "unknown"' 2>/dev/null)
  session_id=$(echo "$json_input" | jq -r '.session_id // ""' 2>/dev/null)
  current_dir=$(echo "$json_input" | jq -r '.workspace.current_dir // .cwd // "~"' 2>/dev/null)

  # Determine maximum context size based on model
  local max_context
  max_context=$(get_max_context_size "$model")

  # Build project directory path
  local project_name transcript_dir
  project_name="${current_dir//[\/.]/-}"
  transcript_dir="$HOME/.claude/projects/$project_name"

  # Get token usage and cache info
  local total_tokens=0 cache_creation=0 cache_read=0
  if [ -n "$session_id" ] && [ -d "$transcript_dir" ]; then
    local usage_info
    usage_info=$(get_token_usage "$session_id" "$transcript_dir")
    total_tokens=$(echo "$usage_info" | cut -d: -f1)
    cache_creation=$(echo "$usage_info" | cut -d: -f2)
    cache_read=$(echo "$usage_info" | cut -d: -f3)
  fi

  # Calculate usage percentage and remaining tokens
  local usage_percent remaining_tokens
  usage_percent=$(calculate_usage_percentage "$total_tokens" "$max_context")
  remaining_tokens=$((max_context - total_tokens))
  if [ "$remaining_tokens" -lt 0 ]; then
    remaining_tokens=0
  fi

  # Get color for usage
  local usage_color
  usage_color=$(get_usage_color "$usage_percent")

  # Generate context usage bar (filled=used, empty=remaining)
  local context_bar
  context_bar=$(generate_progress_bar "$usage_percent")

  # Determine cache status indicator
  local cache_indicator
  if [ "$cache_read" -gt 0 ]; then
    cache_indicator="✓"  # Cache hit
  elif [ "$cache_creation" -gt 0 ]; then
    cache_indicator="◌"  # Cache created but not read yet
  else
    cache_indicator="○"  # No cache
  fi

  # Get today's cost and check ccusage availability
  local today_cost cost_display
  if command -v ccusage >/dev/null 2>&1; then
    today_cost=$(get_cached_cost)
    today_cost=$(printf "%.2f" "$today_cost")
    cost_display="$today_cost"
  else
    cost_display="unavailable"
  fi

  # Format token display with thousands separator
  local total_display remaining_display max_context_display
  total_display=$(format_number "$total_tokens")
  remaining_display=$(format_number "$remaining_tokens")
  max_context_display=$(format_number "$max_context")

  # Get directory name
  local dir_name
  dir_name="${current_dir##*/}"
  if [ -z "$dir_name" ] || [ "$dir_name" = "~" ]; then
    dir_name="$(basename "$current_dir")"
  fi

  # Get git branch info
  local git_branch git_info
  git_branch=$(get_git_info "$current_dir")
  if [ -n "$git_branch" ]; then
    git_info=" | 🌿 $git_branch"
  else
    git_info=""
  fi

  # Output status line with colors
  printf "📁 %s%s | 🤖 %s | 💰 \$%s | ${usage_color}📊 %s %s%% (%s/%s tokens, %s remaining)${COLOR_RESET} | 💾 %s\n" \
    "$dir_name" \
    "$git_info" \
    "$model" \
    "$cost_display" \
    "$context_bar" \
    "$usage_percent" \
    "$total_display" \
    "$max_context_display" \
    "$remaining_display" \
    "$cache_indicator"

  # Display Claude Code usage line after main status
  display_usage_line "$json_input"
}

main "$@"