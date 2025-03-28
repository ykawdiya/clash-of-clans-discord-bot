#!/bin/bash
# Git History Analyzer - A script to view changes across multiple commits

# Default values
NUM_COMMITS=5
FORMAT="medium"
SHOW_STATS=false
SHOW_PATCH=false
FILTER_PATH=""

# Function to display usage information
function show_help {
    echo "Git History Analyzer - View changes across multiple commits"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -n, --num-commits NUMBER   Number of commits to show (default: 5)"
    echo "  -f, --format FORMAT        Output format (oneline|short|medium|full|fuller) (default: medium)"
    echo "  -s, --stats                Show statistics for each commit"
    echo "  -p, --patch                Show patches (changes) for each commit"
    echo "  -d, --dir, --path PATH     Only show changes for specific file or directory"
    echo "  -h, --help                 Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -n 3 -s                 Show last 3 commits with stats"
    echo "  $0 -n 10 --format oneline  Show last 10 commits in compact format"
    echo "  $0 -p -d src/              Show patches for changes in the 'src' directory"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        -n|--num-commits)
            NUM_COMMITS="$2"
            shift 2
            ;;
        -f|--format)
            FORMAT="$2"
            shift 2
            ;;
        -s|--stats)
            SHOW_STATS=true
            shift
            ;;
        -p|--patch)
            SHOW_PATCH=true
            shift
            ;;
        -d|--dir|--path)
            FILTER_PATH="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validate the git repository
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "Error: Not inside a git repository."
    exit 1
fi

# Build git log command
GIT_CMD="git log -${NUM_COMMITS} --format=${FORMAT}"

if [[ "$SHOW_STATS" == true ]]; then
    GIT_CMD="${GIT_CMD} --stat"
fi

if [[ "$SHOW_PATCH" == true ]]; then
    GIT_CMD="${GIT_CMD} -p"
fi

if [[ -n "$FILTER_PATH" ]]; then
    GIT_CMD="${GIT_CMD} -- ${FILTER_PATH}"
fi

# Print header
echo "========================================================"
echo "Git History: Last ${NUM_COMMITS} Commits"
if [[ -n "$FILTER_PATH" ]]; then
    echo "Path filter: ${FILTER_PATH}"
fi
echo "========================================================"

# Execute git command
eval "${GIT_CMD}"

# Show summary information
echo ""
echo "========================================================"
echo "Summary Information"
echo "========================================================"
echo "Total commits analyzed: ${NUM_COMMITS}"

# Show file statistics if requested
if [[ -n "$FILTER_PATH" ]]; then
    echo ""
    echo "Files changed in ${FILTER_PATH} (last ${NUM_COMMITS} commits):"
    git log -${NUM_COMMITS} --name-only --pretty=format:"" -- ${FILTER_PATH} | sort | uniq -c | sort -nr
fi

# Show authors statistics
echo ""
echo "Commit authors (last ${NUM_COMMITS} commits):"
git log -${NUM_COMMITS} --pretty=format:"%an" | sort | uniq -c | sort -nr

echo ""
echo "========================================================"