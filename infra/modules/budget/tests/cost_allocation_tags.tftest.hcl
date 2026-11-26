# Б9 (25.11, AWS COST03-BP02): the cost allocation tags are activated by
# Terraform (aws_ce_cost_allocation_tag), not by a manual click in Billing.
# Mock providers: no AWS.
#   terraform -chdir=infra/modules/budget init -backend=false
#   terraform -chdir=infra/modules/budget test

mock_provider "aws" {
  override_during = plan
}

variables {
  name               = "lawbid-prod"
  monthly_budget_usd = 300
  alert_emails       = ["alerts@example.com"]
}

run "tags_activated_by_code" {
  command = plan
  variables {
    cost_allocation_tags = ["Project", "Env", "Component", "ManagedBy"]
  }
  assert {
    condition     = length(aws_ce_cost_allocation_tag.this) == 4
    error_message = "one activation per tag key"
  }
  assert {
    condition     = alltrue([for t in aws_ce_cost_allocation_tag.this : t.status == "Active"])
    error_message = "every listed key is Active"
  }
  assert {
    condition     = aws_ce_cost_allocation_tag.this["Component"].tag_key == "Component"
    error_message = "the key itself is the tag key"
  }
}

run "empty_list_leaves_the_console_alone" {
  command = plan
  assert {
    condition     = length(aws_ce_cost_allocation_tag.this) == 0
    error_message = "default [] manages no tag (staging / load tests share the account settings)"
  }
}
