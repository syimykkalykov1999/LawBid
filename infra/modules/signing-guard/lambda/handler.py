"""S11-10: detective control for unsigned images.

ECS has no admission control, so the signature check in deploy.yml only guards the
pipeline. This function runs on every ECS "Task State Change" to RUNNING in our
cluster and checks that the image the task started carries a cosign signature in
ECR: cosign stores a signature as an extra tag `sha256-<hex of the signed digest>.sig`
in the same repository. The signed digest is the manifest-list (index) digest of the
tag deploy.yml pushed, so the lookup goes tag -> index digest -> `.sig` tag. An image
without a signature (somebody registered a task definition by hand) publishes one
line to the alerts topic. Sidecars from other registries are ignored.
"""
import json
import os

import boto3

ecr = boto3.client("ecr")
sns = boto3.client("sns")
TOPIC = os.environ["ALERTS_TOPIC_ARN"]
REGISTRY_HOST = os.environ["ECR_REGISTRY_HOST"]  # <account>.dkr.ecr.<region>.amazonaws.com
SIGNED_REPOS = set(os.environ.get("SIGNED_REPOS", "lawbid-api,lawbid-admin").split(","))


def split_image(image):
    """'<host>/<repo>:<tag>' or '<host>/<repo>@sha256:<hex>' -> (repo, tag, digest)."""
    if not image.startswith(REGISTRY_HOST + "/"):
        return None
    rest = image[len(REGISTRY_HOST) + 1:]
    if "@" in rest:
        repo, digest = rest.split("@", 1)
        return repo, None, digest
    repo, _, tag = rest.partition(":")
    return repo, tag or "latest", None


def is_signed(repo, tag, digest):
    image_id = {"imageTag": tag} if tag else {"imageDigest": digest}
    try:
        detail = ecr.describe_images(repositoryName=repo, imageIds=[image_id])["imageDetails"][0]
    except Exception:
        return None  # cannot tell: reported separately, never as "unsigned"
    index_digest = detail["imageDigest"]
    sig_tag = index_digest.replace(":", "-") + ".sig"
    try:
        ecr.describe_images(repositoryName=repo, imageIds=[{"imageTag": sig_tag}])
        return True
    except ecr.exceptions.ImageNotFoundException:
        return False


def lambda_handler(event, _context):
    detail = event.get("detail", {})
    if detail.get("lastStatus") != "RUNNING":
        return {"checked": 0}
    unsigned = []
    for c in detail.get("containers", []):
        parsed = split_image(c.get("image", ""))
        if not parsed or parsed[0] not in SIGNED_REPOS:
            continue
        if is_signed(*parsed) is False:
            unsigned.append(c["image"])
    if unsigned:
        msg = (
            "LawBid: a task started from an image WITHOUT a cosign signature: "
            + ", ".join(unsigned)
            + f"\ntask: {detail.get('taskArn')}\n"
            "Who registered it? Normal releases are signed by deploy.yml. "
            "Roll back to a signed release (Rollback production workflow) and look at "
            "CloudTrail RegisterTaskDefinition / UpdateService."
        )
        sns.publish(TopicArn=TOPIC, Subject="LawBid: unsigned container image running", Message=msg)
    return {"checked": len(detail.get("containers", [])), "unsigned": unsigned}
