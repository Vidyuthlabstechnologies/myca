data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "myca-api"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "main" {
  cidr_block           = "10.40.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = local.name }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = { Name = local.name }
}

resource "aws_subnet" "public" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count = 2

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index + 10)
  availability_zone = local.azs[count.index]

  tags = { Name = "${local.name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = 2

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# A NAT gateway costs about $33 a month before traffic; one t4g.nano instance
# doing the same masquerade costs a few dollars. It is a single instance: if it
# stops, outbound calls (Google sign-in keys, Play, SMS) fail until it is back.
data "aws_ssm_parameter" "al2023_arm64" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64"
}

resource "aws_security_group" "nat" {
  name        = "${local.name}-nat"
  description = "NAT instance: forwards outbound traffic from the private subnets"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Traffic from inside the VPC"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Out to the internet"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_instance" "nat" {
  ami                         = data.aws_ssm_parameter.al2023_arm64.value
  instance_type               = var.nat_instance_type
  subnet_id                   = aws_subnet.public[0].id
  vpc_security_group_ids      = [aws_security_group.nat.id]
  associate_public_ip_address = true
  source_dest_check           = false

  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }

  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  user_data_replace_on_change = true
  user_data                   = <<-EOT
    #!/bin/bash
    set -euo pipefail
    echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/90-nat.conf
    sysctl --system
    dnf install -y iptables-services
    out=$(ip route show default | awk '{print $5; exit}')
    iptables -t nat -A POSTROUTING -o "$out" -s ${aws_vpc.main.cidr_block} -j MASQUERADE
    iptables -P FORWARD ACCEPT
    service iptables save
    systemctl enable --now iptables
  EOT

  tags = { Name = "${local.name}-nat" }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block           = "0.0.0.0/0"
    network_interface_id = aws_instance.nat.primary_network_interface_id
  }

  tags = { Name = "${local.name}-private" }
}

resource "aws_route_table_association" "private" {
  count = 2

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "api" {
  name        = "${local.name}-connector"
  description = "App Runner VPC connector: the API's outbound traffic"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "Out through the NAT instance and to the database"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "Postgres: reachable only from the API"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres from the API"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.api.id]
  }
}
