# STAGE2_SECURITY #15 / #16 (25.11, ASVS 5.0 V17.1.1 / V17.1.2).
#   terraform -chdir=infra/modules/turn init -backend=false
#   terraform -chdir=infra/modules/turn test

mock_provider "aws" {
  mock_data "aws_ssm_parameter" {
    defaults = { value = "ami-12345678" }
  }
  mock_data "aws_region" {
    defaults = { region = "us-east-1" }
  }
  mock_resource "aws_eip" {
    defaults = { public_ip = "198.51.100.10" }
  }
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}
mock_provider "random" {}

variables {
  name      = "t"
  vpc_id    = "vpc-1"
  subnet_id = "subnet-1"
  realm     = "turn.example.dev"
  tags      = {}
}

run "deny_list_is_ranges_coturn_reads" {
  command = plan
  assert {
    condition     = alltrue([for l in output.denied_peer_ranges : !strcontains(l, "/")])
    error_message = "coturn's denied-peer-ip takes an address or first-last, never CIDR (userdb.c add_ip_list_range)."
  }
  assert {
    condition     = contains(output.denied_peer_ranges, "0.0.0.0-0.255.255.255")
    error_message = "0.0.0.0/8 is denied: on Linux 0.0.0.0 reaches the relay host itself."
  }
  assert {
    condition = alltrue([for r in [
      "10.0.0.0-10.255.255.255",
      "127.0.0.0-127.255.255.255",
      "169.254.0.0-169.254.255.255",
      "172.16.0.0-172.31.255.255",
      "192.168.0.0-192.168.255.255",
      "100.64.0.0-100.127.255.255",
      "192.0.0.0-192.0.0.255",
      "198.18.0.0-198.19.255.255",
      "240.0.0.0-255.255.255.255",
      "255.255.255.255-255.255.255.255",
    ] : contains(output.denied_peer_ranges, r)])
    error_message = "Private, loopback, link-local, CGNAT and IANA special ranges are all denied."
  }
  assert {
    condition = alltrue([for r in [
      "::1-::1",
      "::ffff:0:0-::ffff:ffff:ffff",
      "64:ff9b::-64:ff9b::ffff:ffff",
      "fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
      "fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    ] : contains(output.denied_peer_ranges, r)])
    error_message = "The IPv6 loopback, IPv4-mapped, NAT64, ULA and link-local ranges are denied."
  }
  assert {
    condition     = !contains(output.denied_peer_ranges, "0.0.0.0-255.255.255.255")
    error_message = "No line may deny every IPv4 peer (that would break every relayed call)."
  }
}

run "ipv6_in_the_cidr_list_is_refused" {
  command = plan
  variables {
    denied_peer_cidrs = ["10.0.0.0/8", "fc00::/7"]
  }
  expect_failures = [var.denied_peer_cidrs]
}

run "bad_user_quota_is_refused" {
  command = plan
  variables {
    turn_user_quota = -1
  }
  expect_failures = [var.turn_user_quota]
}

run "bad_max_bps_is_refused" {
  command = plan
  variables {
    turn_max_bps = -5
  }
  expect_failures = [var.turn_max_bps]
}

# coturn 4.18.0 (the pinned image) reads every denied-peer-ip / allowed-peer-ip
# value with add_ip_list_range (src/apps/relay/userdb.c): split once on '-',
# each side through make_ioa_addr = inet_pton(AF_INET) or inet_pton(AF_INET6),
# else a DNS lookup. A value that is neither ("10.0.0.0/8") makes set_option
# (src/apps/relay/mainrelay.c, case DENIED_PEER_IPS) log «CIDR is not
# supported» and exit(-1): the relay does not start at all. This run parses
# every line of the RENDERED /etc/turnserver.conf with that same grammar.
run "every_rendered_deny_line_parses_like_coturn" {
  command = apply
  variables {
    on_demand      = true # the on-demand branch of the template too
    health_checks  = false
    alarms_enabled = false
  }
  assert {
    condition     = length(regexall("(?m)^denied-peer-ip=", aws_instance.this.user_data)) == length(output.denied_peer_ranges) && length(output.denied_peer_ranges) >= 20
    error_message = "Each deny range is written once into the rendered config."
  }
  assert {
    condition = alltrue([
      for m in regexall("(?m)^(?:denied|allowed)-peer-ip=(.*)$", aws_instance.this.user_data) :
      length(split("-", m[0])) <= 2 && alltrue([
        for a in split("-", m[0]) :
        can(regex("^[0-9A-Fa-f:.]+$", a)) && can(cidrhost(strcontains(a, ":") ? "${a}/128" : "${a}/32", 0))
      ])
    ])
    error_message = "Every denied-peer-ip value is one IPv4/IPv6 address or <first>-<last> (coturn grammar); CIDR or a name aborts coturn at start."
  }
  assert {
    condition     = strcontains(aws_instance.this.user_data, "denied-peer-ip=169.254.0.0-169.254.255.255\n")
    error_message = "The instance metadata address 169.254.169.254 lies in a denied range."
  }
}

run "coturn_config_has_the_quotas_and_ranges" {
  command = apply
  assert {
    condition     = strcontains(aws_instance.this.user_data, "user-quota=12\n") && strcontains(aws_instance.this.user_data, "max-allocate-lifetime=3600\n")
    error_message = "One credential holds at most 12 allocations; an allocation lives at most 3600 s between refreshes."
  }
  assert {
    condition     = strcontains(aws_instance.this.user_data, "max-bps=0\n") && strcontains(aws_instance.this.user_data, "total-quota=")
    error_message = "max-bps is rendered (0 = no per-session cap, behaviour unchanged) next to total-quota."
  }
  assert {
    condition     = strcontains(aws_instance.this.user_data, "denied-peer-ip=0.0.0.0-0.255.255.255\n") && !strcontains(aws_instance.this.user_data, "denied-peer-ip=10.0.0.0/8")
    error_message = "The config carries range lines, not CIDR lines."
  }
}

# 26.11: TURN over TCP on 443 (networks that let only 443 out). coturn runs
# as nobody (no port below 1024), so the box forwards TCP 443 to 3478 and the
# security group opens TCP 443; tcp_443 = false keeps 3478 only.
run "tcp_443_is_forwarded_and_open" {
  command = plan
  assert {
    condition     = strcontains(aws_instance.this.user_data, "-p tcp --dport 443 -j REDIRECT --to-ports 3478")
    error_message = "The box forwards TCP 443 to coturn's 3478."
  }
  assert {
    condition     = contains([for i in aws_security_group.this.ingress : "${i.protocol}/${i.from_port}-${i.to_port}"], "tcp/443-443")
    error_message = "The security group opens TCP 443."
  }
  assert {
    condition     = contains([for i in aws_security_group.this.ingress : "${i.protocol}/${i.from_port}-${i.to_port}"], "udp/3478-3478") && contains([for i in aws_security_group.this.ingress : "${i.protocol}/${i.from_port}-${i.to_port}"], "tcp/3478-3478")
    error_message = "3478 UDP and TCP stay open."
  }
}

run "tcp_443_off_keeps_3478_only" {
  command = plan
  variables {
    tcp_443 = false
  }
  assert {
    condition     = !strcontains(aws_instance.this.user_data, "--dport 443")
    error_message = "No 443 forwarding when tcp_443 is false."
  }
  assert {
    condition     = !contains([for i in aws_security_group.this.ingress : i.from_port], 443)
    error_message = "No TCP 443 in the security group when tcp_443 is false."
  }
}
