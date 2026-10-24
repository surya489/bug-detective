"""Fine-tuning script for Bug Detective AI model using PEFT/LoRA with Hugging Face transformers.

Usage:
    python services/analyzer/training/train.py --dry-run
    python services/analyzer/training/train.py --dataset sample_data.jsonl --epochs 3
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dataset import load_dataset_jsonl


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fine-tune an open-source Code LLM for Bug Detective."
    )
    parser.add_argument(
        "--dataset",
        type=str,
        default=str(Path(__file__).parent / "sample_data.jsonl"),
        help="Path to training dataset JSONL file.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="Qwen/Qwen2.5-Coder-1.5B-Instruct",
        help="Base model from Hugging Face or local path (e.g. Qwen/Qwen2.5-Coder-1.5B-Instruct).",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=str(Path(__file__).parent / "checkpoints"),
        help="Output directory to save fine-tuned LoRA weights.",
    )
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs.")
    parser.add_argument("--batch-size", type=int, default=2, help="Per-device training batch size.")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate dataset formatting and prompt templates without initializing GPU training.",
    )
    return parser.parse_args()


def format_prompt(instruction: str, code_input: str, output: str = "") -> str:
    """Format sample into ChatML / Alpaca style prompt."""
    prompt = (
        f"<|im_start|>system\n{instruction}<|im_end|>\n"
        f"<|im_start|>user\n{code_input}<|im_end|>\n"
        f"<|im_start|>assistant\n{output}"
    )
    if output:
        prompt += "<|im_end|>"
    return prompt


def run_training(args: argparse.Namespace) -> None:
    dataset_path = Path(args.dataset)
    if not dataset_path.is_file():
        print(f"Error: Dataset not found at {dataset_path}")
        sys.exit(1)

    samples = load_dataset_jsonl(dataset_path)
    print(f"Loaded {len(samples)} training samples from {dataset_path}")

    if args.dry_run:
        print("\n=== DRY RUN VALIDATION ===")
        print(f"Target Base Model: {args.model}")
        print(f"Output Directory : {args.output_dir}")
        print(f"Epochs           : {args.epochs}")
        print(f"Batch Size       : {args.batch_size}")
        print(f"Learning Rate    : {args.lr}")
        print("\nSample Formatted Prompt (Example 1):\n" + "-" * 50)
        first = samples[0]
        print(format_prompt(first.instruction, first.input, first.output))
        print("-" * 50)
        print("\nDataset validation successful. Model pipeline is ready for GPU training.")
        return

    # Check for ML training packages
    try:
        import torch
        from peft import LoraConfig, get_peft_model, TaskType
        from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments
        from trl import SFTTrainer
    except ImportError:
        print("\nNotice: ML training dependencies are not installed in the current environment.")
        print("To run model training with PyTorch and LoRA, run:")
        print("    pip install torch transformers peft trl datasets accelerate")
        print("\nYou can also test without GPU by running with --dry-run:")
        print("    python services/analyzer/training/train.py --dry-run")
        return

    print(f"\nInitializing model training: {args.model}")
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
        device_map="auto" if torch.cuda.is_available() else None,
        trust_remote_code=True,
    )

    lora_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    train_texts = [
        format_prompt(s.instruction, s.input, s.output) for s in samples
    ]

    from datasets import Dataset

    hf_dataset = Dataset.from_dict({"text": train_texts})

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        learning_rate=args.lr,
        logging_steps=1,
        save_strategy="epoch",
        fp16=torch.cuda.is_available(),
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=hf_dataset,
        dataset_text_field="text",
        max_seq_length=2048,
        tokenizer=tokenizer,
        args=training_args,
    )

    print("Starting fine-tuning...")
    trainer.train()
    trainer.save_model(args.output_dir)
    print(f"Training complete! LoRA adapters saved to {args.output_dir}")


if __name__ == "__main__":
    run_training(parse_args())
